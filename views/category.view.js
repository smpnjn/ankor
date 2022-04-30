import * as Category from '../models/category.model.js';

const categoryStructure = {
    allCategories: async function() {
        const allDocuments = await Category.Category.find({});
        var html = '';
        for(let i = 0; i <  allDocuments.length; i++) {
            html += `<a href="/category/${allDocuments[i].title}" class="category" data-category="${allDocuments[i].title}"><span class="menu-icon">${allDocuments[i].icon}</span>${allDocuments[i].displayTitle}</a>`
        }
        return html;
    },
}

export { categoryStructure }