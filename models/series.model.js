import mongoose from 'mongoose'

const schema = mongoose.Schema({ 
    title: 'string',
    canonicalName: 'string',
    date: 'number',
    items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
    seriesPage: 'boolean',
    description: 'string',
    shortDescription: 'string',
    icon: 'string'
});

schema.index({canonicalName: 1});

const Series = mongoose.model('Series', schema);

export { Series }