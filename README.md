## Ankor

A nascent MongoDB rendering platform based on Node.JS, Redis, and MongoDB. Allows you to build MongoDB models which generate APIs automatically. These models can then be accessed via custom HTML tags like the `<data>` tag, to display this data back to the user.

Designed to be super fast, all pages are built on the server and sent to the user in one block, meaning less HTTP requests and faster response times.

Ankor in use can be found on my development website, <a href="https://fjolt.com/">fjolt.com</a>

### Setting up data
Ankor is data first which means models are defined in the `./models/` folder which drive all interactions. You can define any models you like. All models must be named as [model-name].model.js. When a model is created, it creates an API for it automatically. The API endpoints will be:
- `/api/{model name}/` POST: create a new document for this model in format of the defined model
- `/api/{model name}/` GET: reads from the database for items. Accepts `{ query: <query> }` as a body, where query can be any valid mongoose query.
- `/api/{model name}/{array}/:insertionPoint` POST: inserts an item at `:insertionPoint` to an `{array}` within the model. `{array}` can be replaced with the name of any valid array within the model
- `/api/{model name}/update` POST: updates a document. Accepts `{ query: <query>, update: <updates> }` as a body, where query can be any valid mongoose query, and updates are the fields you wish to update. Can only update one item at a time.
- `/api/{model name}/delete` POST: deletes a document.Accepts `{ query: <query> }` as a body, where query can be any valid mongoose query. Can only delete one item at a time.


Here is a typical model file. This one might be called `./models/article.model.js`:
```javascript
import mongoose from 'mongoose'

const schema = mongoose.Schema({ 
    titles: [
        { title : 'string' }
    ], 
    canonicalName: 'string',
    date: 'number',
});

export default {
    "data": mongoose.model('Article', schema),
    "access": 1,
    "unique" : [ "canonicalName" ],
    "rules" : {
        "canonicalName" : /some-Name/g
    },
    "onCreate" : [
        async (bodyData) => {
        }
    ]
    "onDelete" : [
        async (bodyData) => {
        }
    ]
    "onUpdate" : [
        async (bodyData) => {
        }
    ]
}
```

Schemas are defined in the same way as any other MongoDB model using `mongoose.Schema`. The difference is that we export the model in an object on the `data` property. We also export some additional config. Potential config includes:
- `access` (required): the access level a user needs to access a page
- `unique` (optional): elements on the schema which must be unique
- `rules` (optional): optional rules we apply to properties. We can define a RegExp against properties in our schema, to ensure they comply. We can also define 2 other rules:
   - "bcrypt" - which will bcrypt that field every time
   - "date" - which will mean a date is created on submission based on current date in numerical format.
- onCreate, onUpdate, and onDelete (optional): array of functions to run when an item is created, deleted or updated.

## User and Role Models
User and Role models are default models which are required for APIs to work. When you start out, you'll need to make one user, with the following request to `/api/user`:
```javascript
{ 
    username: <username>
    password: <passsword>
}
```

This will create a user and give you an API key. you must pass the username, password and API key in the headers for each of your APIs. This is easy to do in Postman. For example:
```
username: some-username
password: some-password
apiKey: asefaW4fAGR
```

This will also create **roles**. Roles are simple mappings between access levels and names. So an admin user has an access level of 9999, which means you would need to define a model with an access number higher than this to block an admin. We'll get to models in a minute, but your first user will have the role "root". In the future, you can define a user's role by sending it in the API `/api/user`:
```javascript
{ 
    username: <username>
    password: <passsword>
    role: "admin"
}
```

All the roles which are created when you make your first user are as follows - but you can make more with `/api/role`:
```javascript
{
    "admin" : 9999,
    "root" : 9999,
    "writer" : 1,
    "contributor" : 2
}
```

## .env file
Some key configuration items are included in the `.env` file. These include the MongoDB URI string you will use, amongst other things like SMTP server details for emailing. Configure these as you wish - there is an example found in `.env.example`.

## ankor.config.json

The `ankor.config.json` file contains some configuration which you can update. Below are some examples

### File APIs

File APIs are also supported and can be defined in `ankor.config.json`. File APIs are a way to upload files to particular directories on your server. In `ankor.config.json`, a file API configuration might look like this:
```javascript
{
    "fileApi" : {
        "/document/:fileName" : {
            "fileType" : "md",
            "location" : "/documents",
            "parseCode" : true
        },
        "/document/html/:fileName" : {
            "fileType" : "html",
            "location" : "/documents",
            "parseCode" : true
        },
        "/image/article/main-image/:fileName?" : {
            "fileType" : "image",
            "location" : "/public/images/intro-images"
        },
        "/image/article/content-image/:fileName?" : {
            "fileType" : "image",
            "location" : "/public/images/misc"
        }
    }
}
```

Each route defined will be accessible via `/api/`, for example, the first route will be accessible via a `POST` to `/api/document/:fileName`. You should always add `:fileName` to your route, but for images it can be optional. Within each, you can define three options:
- `fileType`: can be `md`, `html`, or `image`. If it is `md` or `html`, you will submit the markdown or HTML raw via the request body. If it is image, you will submit it as form data where the image will be submitted as an image file against the key `image`. If you do select `image`, you also don't have to define a `fileName`.
- `location`: this is the location on the server to save these files to.
- `parseCode`: if your request body contains code either in `<pre><code>` tags or in markdown tags, you can parse it and format it by setting `parseCode` to `true`.

### Other Config Options

There are a few other options available to you within `ankor.config.json`. These are:

- `mail` - if set to `enabled`, an email will be sent every monday. In the future this will be more customizable.
- `mailTitle` - the title of your mail if its enabled.
- `websiteName` - the name of your website. Used for the home page and default titles.
- `websiteDesription` - the description of your website. Used for the home page and default descriptions.
- `api` - API authentication method. Can be set to `basic` or `jwt`. If basic, then username, password and API key will be used. With `jwt`, you can pass `token` in the header of your API request with a token which matches the JWT found in `./certificates/jwt.key`.


### Pages

All pages can be created in the ./views/pages folder. If you create a page, it has to have a config which is contained within the config tag at the top of a page:
```html
<config table="article" filter=":canonicalName" filter-on="canonicalName" limit="1">
    <title>{{title}}</title>
    <description>{{description}}</description>
    <classes>article</classes>
    <robots>noindex,nofollow</robots>
    <url>[ "/article/:canonicalName/:alias?" ]</url>
    <stale>true</stale>
</config>
```

Above, we are using the `<config>` tag in conjunction with a data table from MongoDB. Basically how this works is:
- by defining a "table" attribute on the config, we associate the config with all data from the "article" table. 
- We then filter that data so that it filters on the "canonicalName" field, and we use the ":canonicalName" from the URL to do this. So if someone visits /article/some-name - then the config would filter "canonicalName" by "some-name". 
- We also limit the results to 1 using the "limit" attribute.
- Within config, we can use data associated with the config tag by putting it in curly brackets. For example, {{title}} will use the title attribute from the data we retrieved. 

For configs, only one result is expected - since pages to main data source should be a 1 to 1 relationship.

Within any config, there are the following options, all of which are optional:
- title - the title of the page. Above we take it from the filtered `article` data. So we get the `title` property from the retrieved data.
- description - the description. Again, in the above we take it from the retrieved data.
- classes - any custom classes to add to the body tag, separated by spaces.
- robots - custom robots declarations for your meta tags.
- url - an array of valid routes for this page, using the same format as express.js.
- stale - if set to true, then pages will be semi-stale. That means they will be retrieved directly from Redis DB, and only refreshed after that initial refresh. This will be really fast.

## Components
You can create components in the `./components/` folder. They are a good way to separate out CSS and keep your code tidy. Components are directly transplanted into the page before parsing data - so they are more like an `include()` function. You can add a component to a page using the `<component>` tag:
```html
    <Component name="firstPost" />
    <Component name="triplePost" />
    <Component name="doublePost" times="4" />
```

Above, we have three components. To take an example, the first one will find a component in `./components/firstPost.html` and load it. For the last, we also use the `times` attribute - this takes the component `./components/doublePost.html` and replicates it 4 times.


## Data Tag
The data tag works a little like the `config` tag but has additional properties which makes it an easy way to render MongoDB data straight into your pages. At its core, a data tag takes data from a MongoDB collection, filters it in some way, and produces HTML from it. Since you will get an array of items for any query you do on MongoDB data, you can decide how different items will be rendered using `data-item` and `data-loop` tags within the `data` tag itself.
- `data-item` lets you decide how each individual element returned should be displayed. The first data element returned will go into the first `data-item`, and so on. If the data returns 10 items, but you only use one `data-item`, then only one item will appear on the page.
- `data-loop` will tak all the data and display it in the same way. If you have 1 `data-loop` item, and 10 data items returned from the `data` tag, then 10 items will be shown all as defined in the `data-loop` item.

### Examples

```html
<data table="article" filter=":canonicalName" filter-on="canonicalName" limit="1" main="true">
    <data-item>
        <article id="content">
            <nav id="secondary-navigation"></nav>
            <div id="header-container">
                <h1 headline>{{title}}</h1>
            </div>
        </article>
    </data-item>
</data>
```

Here, we define a data tag which starts with all `article` data from our article collection. We filter it on `canonicalName`, and we use the URL component `:canonicalName` to do the filter (using `filter-on` and `filter` attributes respectively). So if the URL was defined in our config as having a route like `/article/:canonicalName`, and the user went to `/article/my-article`, then this tag would look for any article with a `canonicalName` matching `my-article`.

We then limit this data set to 1 - and we use 1 `<data-item>` within to define how it should look. Inside, we use `{{title}}` to receive the `title` property from our data set. Finally, we call this `data` element our `main` element by setting `main` to `true`. That means if nothing is found, a 404 page will be shown instead. We need this since pages may have other data sets that return empty, but only some matter for showing 404 errors.

Similarly we can loop over multiple elements using `data-loop`. We can also use `data-item` and `data-loop` in tandem - For example:
- a data table returns 10 elements
- we define 2 `data-item` tags at the start, then 1 `data-loop`, then 1 more `data-item`.
- the first 2 elements ar rendered as per the `data-item` tags at the start, the next 7 use the `data-loop`, and the last uses the last `data-item`.

Here is an example with `data-loop`, which will render all categories in our `category` collection:
```html
<data table="category">
    <data-loop>
        <a href="/category/{{title}}" class="category" data-category="{{title}}"><span class="menu-icon">{{icon}}</span>{{displayTitle}}</a>
    </data-loop>
</data>
```

### Relating to parents
Sometimes, we have a situation where a piece of data is associated with another piece of data. For example, an article may have a category. In these cases, we can use the `parents` tag. This lets us relate data within `data` tables to a parent `data` table. For example:
```html
<data table="article" filter=":canonicalName" filter-on="canonicalName" limit="1" main="true">
    <data-item>
        <article id="content">
            <nav id="secondary-navigation"></nav>
            <div id="header-container">
                <!-- PARENT RELATION::: -->
                    <data table="category" limit="1" parents="category equals categoryName">
                        <a class="category inline" href="/category/{{canonicalName}}">
                            {{displayTitle}}
                        </a>
                    </data>
                <!-- :::PARENT RELATION -->
                <h1 headline>{{title}}</h1>
            </div>
        </article>
    </data-item>
</data>
```

Notice how we have a data table here within a data item, which is within a data table itself. In this example, without using the `parents` attibute on our `category` data, all categories would be displayed to the user - not so useful.

Instead, we can say that for the `category` table, we are looking for the item which has the same `categoryName` as the parents `category`. In simpler terms, If the article found has `{ category: "Javascript" }` we want to find the category which has `{ categoryName: "Javascript" }`

Since a `data` tag returns multiple pieces of data, we will find the `category` here which relates to the specific `data-item` we are within. That way, you can have multiple `data-item`s which each have the right categories assigned. 

### Arrays

Sometimes, datasets have arrays within. For example, consider the following document within a collection called "theUsers":
```javascript
{
    name: "Some Name"
    interests: [ { interest: "jogging" }, { interest: "weights" }, { interest: "tv" }, { interest: "music" } ]
}
```

It's often useful to render each array item in some way in HTML - but its not easy to do with just `data` tags and `data-loop`/`data-item`. To fix this, there is an additional attribute called `array`. In this example, we could render each array item like this:
```javascript
<data table="theUsers">
    <data-item>
        <div class="name">
            Name: {{name}}
        </div>
        <div class="interests">
            <array name="interests">
                <strong>{{interest}}</strong>, 
            </array>
        </div>
    </data-item>
</data>
```

### Data Tag Attributes
Within `<data>` there are a number of attributes:
- `table` (accepts collection name) - the table which we want to use for this data element.
- `limit` (accepts a number) - once we have the data set, we can limit the amount of results using this.
- `filter` (accepts a property within the collection model) - lets us filter on properties.
- `filter-on` (accepts a URL component or string filter term) - lets us use text or URL components to pass to our filter.
- `sort` (accepts MongoDB style sorts, like `-date` to sort descending on date) - this is how we sort our results.
- `search` (accepts a property within a collection model) - will search this property for what is defined in `search-on` - i.e., will take a string and search for it within this property.
- `search-on` (accepts a URL component or string term) - lets us use text or URL components to pass into our search.
- `skip` (accepts a number) - will accept a number `n` which will then skip the first `n` elements in the data returned.
- `main` (accepts true) - if set to true, should no data be returned for this element a 404 page will be produced.
- `parents` (accepts x equals y) - will relate the data set to its parent where `x` is the parent property which should match `y` - the current elements property.


### a-if attribute
Sometimes, elements may be left empty should a property not exist. For example, consider a model where the `date` attribute is optional. In these cases, we can add the `a-if` attribute to a tag. If its left empty after rendering, it will be removed:
```
<data table="theUsers">
    <data-item>
        <div class="name" a-if>
            {{name}}
        </div>
    </data-item>
</data>
```
## Files
You can import files from the server associated with certain pieces of data. This is useful if you upload a file via file API and want to use it within one of your pages. To find a file associated with a particular `<data-item>` or `<data-loop>` item, you can do this:
```html
<data table="article" filter="canonicalName" filter-on="canonicalName" limit="1">
    <data-item>
        <File directory="./documents" name="canonicalName" extension="md|html">
    </data-item>
</data>
```

The file HTML tag takes 3 properties:
- `directory` - the directory on the server from the root where the file is stored
- `name` - the property from the `<data-item>` to use for the file name. For example, if this article had `{ canonicalName: "some-article" }`, then we would look for `some-article` as the file name.
- `extension` - any possible extensions separated by `|`. Here, we will look for `md` files and `html` files. If any are found, then one will be used. Here, `md` files will be given precedence over `html` files should both exist.

## CSS within Pages and Components
You can define CSS within `./common.css` if you want it to appear everywhere. A better approach though is to define it within pages and components - in that way CSS will only be loaded if the component or page uses it. You can define two types of CSS - `async` or `combined`. 
- `async` CSS is loaded asynchronously, meaning it won't slow the users page load time. 
- `combined` CSS is loaded synchronously, which means it will block page load time.

If you have some CSS for `:hover` states, for example, you may load that using `async` CSS so that it doesn't slow the user down. To define CSS in any page or component, you use just normal style tags. Here is an example of a page:
```html
<config>
    <!-- your config tag -->
</config>
<h1>Hello World!</h1>
<style combined>
    h1 {
        color: black;
        font-weight: bold
    }
</style>
<style async>
    h1:hover {
        color: blue
    }  
</style>
```

To reduce HTTP requests, all CSS is compressed on the fly. We use file modification dates to test if we can use compressed CSS from Redis, or if we should re-compress it - meaning there is never a lag. CSS is then served embedded into the page itself. That means unlike in other tools, there are no chunk CSS files. 

All CSS will arrive to the user with their initial HTTP request - so there is only one HTTP request. Chunks each require a separate HTTP request which although not usually a problem, does eat into page load time. This way we can fully optimize the page load as much as possible.