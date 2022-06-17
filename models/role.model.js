import mongoose from 'mongoose'

const schema = new mongoose.Schema({ 
    role: 'string',
    importance: 'number'
});

const Role = mongoose.model('Role', schema);

export { Role };