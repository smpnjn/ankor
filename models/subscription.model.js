import mongoose from 'mongoose'

const schema = new mongoose.Schema({ 
    email: 'string'
});

const Subscription = mongoose.model('Subscription', schema);

export { Subscription };