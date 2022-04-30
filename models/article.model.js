import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../', '.env') });

const connection = mongoose.createConnection(process.env.mongooseUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const schema = new mongoose.Schema({ 
    titles: [
        { title : 'string' }
    ], 
    tags: [ 'string' ], 
    canonicalName: 'string',
    date: 'number',
    description: 'string',
    shortDescription: 'string',
    icon: 'string',
    author: 'string',
    category: 'string',
    mainPage: mongoose.Schema.Types.Mixed,
    series: 'string',
    customSeries: {
        icon: 'string',
        subArea: 'string',
    }
});

const Article = connection.model('Article', schema);

export { Article };