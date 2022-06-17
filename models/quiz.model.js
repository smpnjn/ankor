import mongoose from 'mongoose'

const schema = new mongoose.Schema({ 
    article: 'string',
    canonicalName: 'string',
    associatedCanonical: 'string',
    title: 'string',
    questions: [ {
        options: [ 'string' ],
        question: 'string',
        answer: 'number'
    }],
    quizDescription: 'string'
});

const Quiz = mongoose.model('Quiz', schema);

export { Quiz };