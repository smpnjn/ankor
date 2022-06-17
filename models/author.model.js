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

const Author = mongoose.model('Author', schema);

export { Author };