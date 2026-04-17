const Sparx_Requesticator = require('./requesticatorBasic.js');
const {decode, encode} = require('./children/maths/sm_code.js');
const getTokenSparx = require('./login.js');
const getTokenRequest = require('./getTokenRequest.js');

class SparxBase {
    /**
     * @param {string} authToken 
     * @param {object} login 
     * @param {string} cookies 
     * @param {function} decodeFunc - The subject-specific decode function
     * @param {function} encodeFunc - The subject-specific encode function
     */
    constructor(authToken, login = {}, cookies, decodeFunc=decode, encodeFunc=encode) {
        this.authToken = authToken;
        this.login = login;
        this.cookies = cookies;
        this.decodeFunc = decodeFunc;
        this.encodeFunc = encodeFunc;
        this.studentUserId = null;
        this.log = {
            logToFile: () => {}
        };
        
        // Default Requesticator
        this.curlRequests = new Sparx_Requesticator(authToken);
    }

    async send(url, uint8Array, attempts = 3) {
        try {
            this.log.logToFile(`Sending request to ${url}`);
            const response = await this.curlRequests.sendRequest(url, uint8Array);
            this.log.logToFile(`**Response returned**\nStatus: ${response.status}\n${JSON.stringify(response.headers, null, 2)}`);

            // 1. Check for standard HTTP 401 Unauthorized
            if (response.status == 401) {
                const err = new Error("Unauthorized");
                err.response = { status: 401 };
                throw err;
            }

            const grpcStatus = response.headers['grpc-status'];
            const grpcMessage = response.headers['grpc-message'];

            // 2. Handle gRPC Specific Statuses and Messages
            if (grpcStatus) {
                if (grpcStatus === '8') {
                    return 8;
                }

                if (grpcStatus === '9' && grpcMessage === 'wrong question state for answer action') {
                    return 9;
                }

                if (['16', '9', '7'].includes(grpcStatus)) {
                    if (grpcMessage === 'TaskItemHidden') {
                        this.log.logToFile('Item is hidden so just break');
                        return 'break';
                    }
                    if (grpcMessage?.includes('PendingWAC')) {
                        this.log.logToFile("Bookwork check caught");
                        return null;
                    } 
                    if (grpcMessage?.includes('SessionInactive')) {
                        this.log.logToFile("SESSION INACTIVE CAUGHT!");
                        if (typeof this.getClientSession === 'function') {
                            await this.getClientSession();
                        }
                        // Retry without decrementing attempts (from original logic)
                        return await this.send(url, uint8Array, attempts); 
                    }
                }
            }

            // 3. Return successful response
            return response;

        } catch (err) {
            // If we are out of attempts, throw the error immediately
            if (attempts <= 1) {
                throw err;
            }

            // Wait 5 seconds before retrying
            await new Promise(res => setTimeout(res, 5000));
            this.log.logToFile(err);

            // 4. Handle 401 Re-authentication
            if (err.response?.status === 401) {
                this.log.logToFile("Caught 401 Unauthorized, handling it attempting relogin...");

                let newAuthToken;
                if (this.login?.school) {
                    const newAuthTokenN = await getTokenSparx({
                        school: this.login.school,
                        username: this.login.username,
                        password: this.login.password,
                        type: this.login.type
                    });
                    if (newAuthTokenN?.cookies) {
                        this.cookies = newAuthTokenN.cookies;
                    }
                    if (newAuthTokenN?.authToken) {
                        newAuthToken = newAuthTokenN.authToken;
                    }
                } else {
                    newAuthToken = await getTokenRequest(this.cookies);
                    if (newAuthToken?.includes('Unauthorized')) {
                        throw err; // Stop retrying if strictly unauthorized
                    }
                }

                if (newAuthToken) {
                    this.log.logToFile('The new authtoken has been successfully acquired!');
                    this.authToken = newAuthToken;
                    this.curlRequests.headers[2] = `authorization: ${this.authToken}`;
                    
                    // Included from Method 1: refresh client session on new token
                    if (typeof this.getClientSession === 'function') {
                        await this.getClientSession();
                    }
                } else {
                    this.log.logToFile('Unable to login after 401 status code');
                }
            }

            // 5. Retry request (handles both 401s after re-auth, and generic network errors)
            return await this.send(url, uint8Array, attempts - 1);
        }
    }

    stripGrpcWebTrailer(uint8Array) {
        const TRAILER_FLAG = 0x80;
        const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);

        for (let i = 0; i <= uint8Array.length - 5; i++) {
            const isTrailer = (uint8Array[i] & TRAILER_FLAG) === TRAILER_FLAG;

            if (isTrailer) {
                const length = dataView.getUint32(i + 1); // Big-endian by default
                if (i + 5 + length === uint8Array.length) {
                    return uint8Array.slice(0, i); // trailer detected and stripped
                }
            }
        }
        return uint8Array; // no trailer found
    }

    async decodeStuff(buffer, className) {
        const bytes = new Uint8Array(buffer);
        let bytesNoStart = bytes.slice(5, bytes.length); // Remove compression flag and grpc header
        let trimmed = this.stripGrpcWebTrailer(bytesNoStart);
        const data = await this.decodeFunc(trimmed, className);
        return data;
    }

    async encodeStuff(inputObject, className) {
        const data = await this.encodeFunc(inputObject, className);

        const grpcHeader = Buffer.alloc(5);
        grpcHeader.writeUInt8(0, 0); // Compression flag (0 = not compressed)
        grpcHeader.writeUInt32BE(data.length, 1);
        const fullMessage = Buffer.concat([grpcHeader, data]);

        return fullMessage;
    }

    async getUserDisplayName() {
        const url = 'https://api.sparx-learning.com/sparx.leaderboards.userdisplay.v1.UserDisplay/GetUserDisplayDataForCurrentUser';
        const fullMessage = await this.encodeStuff({}, 'GetUserDisplayDataForCurrentUserRequest');

        const userDisplayBuffer = await this.send(url, fullMessage);
        if (userDisplayBuffer.headers['grpc-status'] === '16') {
            return null;
        }

        const userDisplayData = await this.decodeStuff(userDisplayBuffer.data, 'UserDisplayData');
        return userDisplayData.positiveNoun || 'User';
    }

    async getUserInfo() {
        const url = 'https://api.sparx-learning.com/sparx.auth.userinfo.v1.UserInfoService/GetUserInfo';
        const fullMessage = await this.encodeStuff({}, 'UpdateUserDisplayDataForCurrentUserRequest');

        const userInfoBuffer = await this.send(url, fullMessage);
        if (userInfoBuffer?.headers['grpc-status'] === '16') {
            return;
        }

        const userInfo = await this.decodeStuff(userInfoBuffer.data, 'UserInfo');
        if (userInfo.subject) {
            this.studentUserId = (userInfo.subject.split('/'))[1];
        }
        return userInfo;
    }

    async changePositiveNoun(noun) {
        const positiveNounInput = {
            "userDisplayData": {
                "name": `users/${this.studentUserId}/userdisplaydata`,
                "positiveNoun": noun,
                "optedOutProducts": []
            },
            "updateMask": {
                "paths": ["positive_noun", "opted_out_products"]
            }
        };

        const url = 'https://api.sparx-learning.com/sparx.leaderboards.userdisplay.v1.UserDisplay/UpdateUserDisplayDataForCurrentUser';
        const fullMessage = await this.encodeStuff(positiveNounInput, 'UpdateUserDisplayDataForCurrentUserRequest');

        const positiveNounRequest = await this.send(url, fullMessage);

        if (positiveNounRequest.headers['grpc-status'] === '3') {
            return 3;
        }
        return 1;
    }

    async getAccountId() {
        const userInfo = await this.getUserInfo();
        return userInfo.subject + userInfo.displayName;
    }
}

module.exports = SparxBase;