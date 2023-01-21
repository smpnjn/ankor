import mongoose from 'mongoose'

const schema = mongoose.Schema({ 
    displayName: 'string',
    name: 'string',
    description: 'string', 
    social: [ 
        { socialType: 'string', username: 'string' } ],
    image: 'string',
    socialHtml: 'string'
});

export default {
    "data": mongoose.model('Author', schema),
    "access": 1,
    "unique" : [ "name" ]
}