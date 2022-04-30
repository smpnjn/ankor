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
    role: 'string',
    importance: 'number'
});

const Role = connection.model('Role', schema);

export { Role };