import mongoose from 'mongoose'

const schema = mongoose.Schema({ 
    title: 'string',
    canonicalName: 'string',
    date: { type: 'number', required: false },
    items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
    seriesPage: 'boolean',
    description: 'string',
    shortDescription: 'string',
    icon: 'string'
});

schema.index({canonicalName: 1});


export default {
    "data": mongoose.model('Series', schema),
    "access": 2,
    "unique" : [ "canonicalName" ],
    "rules" : {
        "date" : "date"
    }
}