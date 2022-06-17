import mongoose from 'mongoose'

const schema = mongoose.Schema({ 
    titles: [
        { title : 'string' }
    ], 
    associatedWith: {
        required: false,
        type: {
            category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
            series: { type: mongoose.Schema.Types.ObjectId, ref: 'Series' },
            quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
            author: { type: mongoose.Schema.Types.ObjectId, ref: 'Author' },
            tags: [ 'string' ],
            search: [ 'string' ]
        }
    },
    canonicalName: 'string',
    date: 'number',
    description: 'string',
    shortDescription: 'string',
    icon: 'string',
    author: 'string',
    tags: [ 'string' ],
    category: 'string',
    mainPage: mongoose.Schema.Types.Mixed,
    series: 'string',
    additionalSeriesData: {
        icon: 'string',
        subArea: 'string',
    }
});

schema.index({canonicalName: 1});

const Article = mongoose.model('Article', schema);

export { Article };