import mongoose from 'mongoose'

const schema = mongoose.Schema({ 
    api: 'string',
    accessLevel: 'number'
});

const Access = mongoose.model('Access', schema, 'access');

export { Access };