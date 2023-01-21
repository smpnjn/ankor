import mongoose from 'mongoose'

const schema = new mongoose.Schema({ 
    email: 'string'
});

export default {
    "data" : mongoose.model('Subscription', schema),
    "access" : 0,
    "rules" : {
        "email" : /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    },
    "unique" : [ "email" ],
    "methods" : [ "post" ]
}
