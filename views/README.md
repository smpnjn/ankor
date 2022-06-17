# Information on Views

## common folder
Every file in the `common` directory is content loaded onto every page - so be careful when you add content here as it will affect load speed on pages without a Redis cached version. Files within this folder can be used on any page within the **./views/pages** folder, by adding `{{FILENAME}}` (without .html). For example, `{{sidebar}}` to load sidebar.html.

**Note**: common folder files cannot be used anywhere else except for pages. For anything else, please use components. However, we will process components in `common` folder files.

### CSS file (style.css)

You can also add a style.css file here which functions the same as common.css. This is in `.gitignore` so useful if you want to include CSS that will not be visible on GitHub.

## components folder
Every file in the `components` folder can be accessed in a page or another component using the {{component-FILENAME}} format, where FILENAME is the name of the file. For example, `{{component-author}}` for `./components/author.html`

## page folder
Every file in the `page` folder is converted into a page. That means that the `header`, and `banner` are appended to the top of the page, and the `footer` to the bottom.
