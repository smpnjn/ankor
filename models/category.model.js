import mongoose from 'mongoose'

const schema = mongoose.Schema({ 
    title: 'string',
    canonicalName: 'string',
    displayTitle: 'string',
    description: 'string', 
    icon: 'string',
    color: [ 'string', 'string' ],
    tags: [ 'string' ],
});

schema.index({canonicalName: 1});

const Category = mongoose.model('Category', schema);

export { Category };

