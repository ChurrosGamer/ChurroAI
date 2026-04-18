const { decode, encode } = require('./sr_code.js');
const SparxBase = require('../../requesticator.js');

class SparxReader extends SparxBase {
    constructor(authToken, login={}, cookies) {
        super(authToken, login, cookies, decode, encode);
    }

    async sendUserActive(path) {
        const url = 'https://api.sparx-learning.com/reader/sparx.reading.users.v1.Sessions/UserActive';
        let fullMessage = await this.encodeStuff({"currentPath": path}, 'UserActiveRequest');
        await this.send(url, fullMessage);
    } // /library; /task;

    async startSwappedBook(bookObj) {
        let url = 'https://api.sparx-learning.com/reader/sparx.reading.users.librarybooks.v1.LibraryBooks/UpdateLibraryBook';
        bookObj.swapped = 1;
        bookObj.isEnded = false;
        bookObj.recommendedBy = "";
        // console.log('Update book input', {studentBook: bookObj});

        let fullMessage = await this.encodeStuff({studentBook: bookObj}, 'UpdateLibraryBookRequest');
        const userInfoBuffer = await this.send(url, fullMessage);
        await this.decodeStuff(userInfoBuffer.data, 'UpdateLibraryBookResponse');
        // console.log('Book update response', bookUpdateResponse);
    }

    async getNewBook() {
        let url = 'https://api.sparx-learning.com/reader/sparx.reading.users.librarybooks.v1.LibraryBooks/ListLibraryBooks';

        let fullMessage = await this.encodeStuff({}, 'UpdateUserDisplayDataForCurrentUserRequest');

        const userInfoBuffer = await this.send(url, fullMessage);
        const libraryBooks = await this.decodeStuff(userInfoBuffer.data, 'ListLibraryBooks');
        for (const book of libraryBooks.libraryBooks) {
            // console.log('Book check', book);
            if (book.studentBook.swapped === 2 && !book.studentBook.isComplete) {
                await this.startSwappedBook(book.studentBook);
                return book.studentBook.bookId;
            }
        }

        const bookOptions = await this.getNewBookOptions();
        if (bookOptions.books.length) {
            return bookOptions.books[0].name.split('/')[1]; // bookUid
        }

        return null;
        /*
        for (const book of libraryBooks.libraryBooks) {
            // console.log('Book check', book);
            if (!book.studentBook.isActive && !book.studentBook.isComplete) {
                await this.startSwappedBook(book.studentBook);
                return book.studentBook.bookId;
            }
        }
        */
    }

    async getHomeworks() {
        // https://api.sparx-learning.com/reader/sparx.reading.users.librarybooks.v1.LibraryBooks/ListLibraryBooks
        // console.log(this.authToken);
        let url = 'https://api.sparx-learning.com/reader/sparx.reading.users.librarybooks.v1.LibraryBooks/ListLibraryBooks';

        let fullMessage = await this.encodeStuff({}, 'UpdateUserDisplayDataForCurrentUserRequest');

        const userInfoBuffer = await this.send(url, fullMessage);
        const libraryBooks = await this.decodeStuff(userInfoBuffer.data, 'ListLibraryBooks');
        const activeBooks = [];

        for (const book of libraryBooks.libraryBooks) {
            if (book.studentBook.isActive || book.studentBook.isTeacherAssigned) {
                const progress = Math.round(book.studentBook.progress * 100);
                const bookObj = {
                    title: book.studentBook.title,
                    bookId: book.studentBook.bookId,
                    progress: progress
                };
                if (book.studentBook.isTeacherAssigned) {
                    if (progress < 100) {
                        bookObj.setBook = true;
                        activeBooks.push(bookObj);
                    }
                } else {
                    bookObj.setBook = false;
                    activeBooks.push(bookObj);
                }
            }
        }

        return activeBooks;
    }

    async getGoldReaderState() {
        let url = 'https://api.sparx-learning.com/reader/sparx.reading.users.v1.Sessions/GetGoldReaderState';

        let fullMessage = await this.encodeStuff({}, 'UpdateUserDisplayDataForCurrentUserRequest');

        const userInfoBuffer = await this.send(url, fullMessage);
        if (userInfoBuffer.headers['grpc-status'] === '16') {
            // console.log(`The network request was unsuccessful: ${userInfoBuffer.headers['grpc-message']}`);
            return;
        }

        const userInfo = await this.decodeStuff(userInfoBuffer.data, 'GetGoldReaderStateResponse');
        return userInfo.goldReaderState;
    }

    async getBookText(bookId, taskId) {
        // https://api.sparx-learning.com/reader/sparx.reading.content.v1.Books/GetBook
        
        // console.log(this.authToken);
        let url = 'https://api.sparx-learning.com/reader/sparx.reading.content.v1.Books/GetBook';

        const bookRequest = {
            "bookId": bookId,
            "taskId": taskId
        };

        let fullMessage = await this.encodeStuff(bookRequest, 'GetBookRequest');

        // console.log("Get book text calls send");
        const userInfoBuffer = await this.send(url, fullMessage);
        if (userInfoBuffer.headers['grpc-status'] === '16') {
            // console.log(`The network request was unsuccessful: ${userInfoBuffer.headers['grpc-message']}`);
            return;
        }

        const bookText = await this.decodeStuff(userInfoBuffer.data, 'GetBookResponse');

        // console.log(bookText.bookV2.content.reflowable.body.sections[0]);

        let paragraph = "";
        let wordCount = 0;

        for (const text of bookText.bookV2.content.reflowable.body.sections) {
            // console.log(text.content.paragraph.spans);
            if (text.content.oneofKind === 'paragraph') {
                // console.log(text.content.paragraph.spans[0].runs[0].content);
                for (const span of text.content.paragraph.spans) {
                    wordCount += span.wordCount;
                    for (const run of span.runs) {
                        const textBody = run.content;
                        paragraph += ` ${textBody}`;
                    }
                }
                // const textBody = text.content.paragraph.spans[0].runs[0].content;
                // paragraph += ` ${textBody}`;
            }
        }

        // console.log(paragraph);

        // console.log(bookText);

        return { paragraph: paragraph, wordCount: wordCount };
    }

    async getBookTask(bookId) {
        const url = "https://api.sparx-learning.com/reader/sparx.reading.tasks.v1.Tasks/GetBookTask";
        const bookObj = {
            "bookId": bookId,
            "chapterName": undefined,
            "requestReread": true
        };
        const proceedMessage = await this.encodeStuff(bookObj, 'GetBookTaskRequest');

        // console.log("Book task calls send");
        const questionBuffer = await this.send(url, proceedMessage);
        if (questionBuffer === 8) {
            return 8;
        }


        const questionFull = await this.decodeStuff(questionBuffer.data, 'GetBookTaskResponse');
        // console.log('getBookTask', questionFull);
        return questionFull.loadTaskId;

    }

    async proceedTimeout(taskId) {
        const url = 'https://api.sparx-learning.com/reader/sparx.reading.tasks.v1.Tasks/SendTaskAction';
        const proceedObj = {
            "taskId": taskId,
            "action": {
                "action": {
                    "oneofKind": "paperback",
                    "paperback": {
                        "action": {
                            "oneofKind": "answer",
                            "answer": "<timeout>"
                        },
                        "identifier": ""
                    }
                }
            },
            "catchUpMode": false,
            "signatureEvent": {
                "signatures": []
            }
        };


        const proceedMessage = await this.encodeStuff(proceedObj, 'SendTaskActionRequest');
        // console.log("proceed question buffer calls send");
        await this.send(url, proceedMessage);
    }

    async proceedQuestion(taskId) {

        const url = 'https://api.sparx-learning.com/reader/sparx.reading.tasks.v1.Tasks/SendTaskAction';
        const proceedObj = {
            "taskId": taskId,
            "action": {
                "action": {
                    "oneofKind": "paperback",
                    "paperback": {
                        "action": {
                            "oneofKind": "proceed",
                            "proceed": true
                        },
                        "identifier": ""
                    }
                }
            },
            "catchUpMode": false,
            "signatureEvent": {
                "signatures": []
            }
        };

        const proceedMessage = await this.encodeStuff(proceedObj, 'SendTaskActionRequest');
        // console.log("proceed question buffer calls send");
        const questionBuffer = await this.send(url, proceedMessage);

        if (questionBuffer.headers['grpc-status'] === '9') {
            if (questionBuffer.headers['grpc-message'] === 'task is completed') {
                await this.retryQuestion(taskId);
            } else {
                await this.proceedTimeout(taskId);
            }
            return 9;
        }

        const questionFull = await this.decodeStuff(questionBuffer.data, 'SendTaskActionResponse');
        // console.log(questionFull);
 
        if (questionFull?.task?.state?.state?.paperback?.currentQuestion) {
            const questionIdentifier = questionFull.task.state.state.paperback.currentQuestion.questionId;
            const questionText = questionFull.task.state.state.paperback.currentQuestion.questionText;
            const questionOptions = questionFull.task.state.state.paperback.currentQuestion.options;
            
            // console.log("Q full here");
            // console.log(questionFull.task.state.state.paperback.results);
            
            if (questionFull?.task?.state?.experience) {
                // console.log(`Experience Gained: ${questionFull.task.state.experience}`);
                return {
                    experience: questionFull.task.state.experience,
                    results: questionFull.task.state.results
                };
            }

            const questionObject = {
                questionIdentifier: questionIdentifier,
                questionText: questionText,
                questionOptions: questionOptions
            };

            return questionObject;
        } else {
            return await this.proceedQuestion(taskId);
        }
    }

    async retryQuestion(taskId) {
        let url = 'https://api.sparx-learning.com/reader/sparx.reading.tasks.v1.Tasks/SendTaskAction';
        const proceedObj = {
            "taskId": taskId,
            "action": {
                "action": {
                    "oneofKind": "retry",
                    "retry": true
                }
            },
            "catchUpMode": false
        };

        const proceedMessage = await this.encodeStuff(proceedObj, 'SendTaskActionRequest');
        // console.log("Retry question buffer calls send");
        await this.send(url, proceedMessage);

        // const questionFull = await this.decodeStuff(questionBuffer.data, 'SendTaskActionResponse');
        // console.log(questionFull);
        // console.log("retry question");
        // console.log(questionFull.task.state.state.paperback);
    }

    async getNewBookOptions() {
        let url = 'https://api.sparx-learning.com/reader/sparx.reading.users.librarybooks.v1.LibraryBooks/ListNewBooks';

        let fullMessage = await this.encodeStuff({"userId": ""}, 'ListNewBooksRequest');

        const userDisplayBuffer = await this.send(url, fullMessage);
        if (userDisplayBuffer.headers['grpc-status'] === '16') {
            return null;
        }

        const userDisplayData = await this.decodeStuff(userDisplayBuffer.data, 'ListNewBooksResponse');

        return userDisplayData;
    }
}

module.exports = SparxReader;