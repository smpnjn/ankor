import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../', '.env') });

mongoose.createConnection(process.env.mongooseUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const schema = new mongoose.Schema({ 
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