import mongoose from 'mongoose'


const schema = new mongoose.Schema({ 
    username: 'string',
    password: 'string', 
    apiEnabled: 'boolean',
    apiKey: 'string',
    role: 'string',
});

const User = mongoose.model('User', schema);

export { User };