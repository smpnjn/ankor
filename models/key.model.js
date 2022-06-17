import mongoose from 'mongoose'

const schema = mongoose.Schema({ 
    username: 'string',
    uniqueKey: 'string',
    dateCreated: 'number',
    keyType: 'string'
});

const Key = mongoose.model('Key', schema);

export { Key };