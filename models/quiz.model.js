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

export default {
    "data": mongoose.model('Quiz', schema),
    "access": 2,
    "unique" : [ "canonicalName" ]
}