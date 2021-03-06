(function(global){

function createCallback(callback, args) {
    var scope, func;
    if (!args) args = [];
    switch (typeof(callback)) {
        case "function":
            scope = null;
            func = callback;
            return {
                scope: scope,
                func: func,
                args: args
            };
        case "object":
            if (!callback.scope) callback.scope = null;
            callback.args = callback.args ? args.concat(callback.args) : callback.args;
            return callback;
    }
    throw "Invalid callback";
};

function isUnd(a) {
    return typeof(a) === "undefined";
}
var Tokenizer;

/**
* Tokenizer implements a powerful general purpose tokenizer based on native javascript regular expressions.
* @class Tokenizer
* @constructor
* @param config object Configuration options. The following
**/
(Tokenizer = function(config) {
    this.init(config || {});
}).prototype = {
    /**
     * Initialize the tokenizer and define which types of tokens should be returned.
     * @method init
     * @param {object} config
     */
    init: function(config) {
        var name,
            tokenDefs = config.tokens ? config.tokens : config,
            flags = "g",
            tokenType, tokenDef,
            pattern,
            tokenTypes = this.tokenTypes = {},
            regexp = "",
            group = 0, groupCount,
            attributes, attributeName, attribute,
            callback,
            defaultToken,
            initToken = function(name) {
                tokenDef = tokenDefs[name];
                pattern = (tokenDef.constructor === RegExp ? tokenDef : tokenDef.pattern).source;
                if (pattern === ".") defaultToken = name;
                if (regexp.length) regexp += "|";
                regexp += "(" + pattern + ")";
                pattern = pattern.replace(/\\\\/g, "").replace(/\\\(/g, "");
                groupCount = pattern.length - pattern.replace(/\(/g, "").length;
                tokenType = {
                    name: tokenDef.name ? tokenDef.name : name,
                    tokenDef: tokenDef,
                    group: ++group,
                    groupCount: groupCount
                };
                group += groupCount;

                if (attributes = tokenDef.attributes) {
                    for (attributeName in attributes) {
                        attribute = attributes[attributeName];
                        switch (typeof(attribute)) {
                            case "number":
                                attributes[attributeName] = {
                                    group: parseInt(attribute, 10)
                                };
                                break;
                            case "function":
                                attributes[attributeName] = {
                                    callback: createCallback(attribute, [null])
                                };
                                break;
                            case "object":
                                break;
                        }
                    }
                }
                else tokenDef.attributes = {
                    text: {
                        group: 0
                    }
                };

                if (callback = tokenDef.callback) tokenType.callback = createCallback(callback, [null, null]);
                tokenTypes[name] = tokenType;
            }
        ;
        for (name in tokenDefs) initToken(name);
        if (!defaultToken) {
            tokenDefs = {
                default: /.+/
            };
            initToken("default");
        }
        if (config.ignoreCase) flags += "i";
        this.regexp = new RegExp(regexp, flags);
        if (!isUnd(config.exclude)) this.exclude(config.exclude);
        if (!isUnd(config.text)) this.text(config.text);
    },
    /**
     * Set the text that is to be tokenized.
     * @method
     * @param {string} text The text that is to be tokenized.
     * @param {int} from An index to indicate where to start tokenization. Default 0 (Optional).
     * @param {int} to An index indicating up to where the text should be tokenized. Defaults to the entire length of the text (Optional).
     */
    text: function(text, from, to){
        this._text = text;
        this.regexp.lastIndex = this._next = from ? from : 0;
        this.to = to ? to : text.length;
    },
    /**
     * Indicates whether there are more tokens.
     * @method
     * @return boolean
     */
    more: function() {
        return this.regexp.lastIndex < this.to;
    },
    /**
     * Get the current token.
     * @method
     * @return object
     */
    one: function() {
        var match = this.regexp.exec(this._text);
        if (!match) return;
        var text = match[0],
            at = match.index,
            name, tokenType, tokenTypeName, group, tokenDef,
            exclude = this._exclude,
            attributes, attribute, attributeValue,
            tokenTypes = this.tokenTypes, token,
            callback, args
        ;
        this._next = at + text.length;
        for (name in tokenTypes) {
            tokenType = tokenTypes[name];
            group = tokenType.group;
            if (text !== match[group]) continue;
            tokenDef = tokenType.tokenDef;
            tokenTypeName = tokenType.name;
            if (exclude && exclude[tokenTypeName]) return this.one();
            token = {
                type: tokenTypeName,
                at: at
            };

            attributes = tokenDef.attributes;
            for (name in attributes) {
                attribute = attributes[name];
                if (isUnd(attribute.group)) attributeValue = text;
                else attributeValue = match[group + attribute.group];
                callback = attribute.callback;
                if (!isUnd(callback)) {
                    args = callback.args;
                    args[0] = attributeValue;
                    attributeValue = callback.func.apply(callback.scope, args);
                }
                switch (attribute.type) {
                    case "number":
                        attributeValue = Number(attributeValue);
                        break;
                    case "int":
                        attributeValue = parseInt(attributeValue, 10);
                        break;
                    case "float":
                        attributeValue = parseFloat(attributeValue);
                        break;
                    case "date":
                        attributeValue = new Date(attributeValue);
                        break;
                    case "boolean":
                        attributeValue = attributeValue ? true : false;
                        break;
                }
                token[name] = attributeValue;
            }

            if (callback = tokenType.callback) {
                args = callback.args;
                args[0] = token;
                args[1] = match.slice(group, group + tokenType.groupCount + 1);
                callback.func.apply(callback.scope, args);
            }
            break;
        }
        return token;
    },
    /**
     * Iterate through tokens and notify a callback for each token.
     * @method
     * @param callback object
     * @return boolean
     */
    each: function(callback) {
        callback = createCallback(callback, [null]);
        var func = callback.func,
            args = callback.args,
            scope = callback.scope,
            token
        ;
        while (this.more()) {
            if (args[0] = this.one()) {
                if (func.apply(scope, args) === false) return false;
            }
        }
        return true;
    },
    /**
     * Return all tokens in an array.
     * @method all
     * @return array
     */
    all: function() {
        var tokens = [];
        this.each(function(tokenizer, token){
            tokens.push(token);
        });
        return tokens;
    },
    /**
     * Specifies which tokens should be filtered out and ignored.
     * @method exclude
     * @param config object
     */
    exclude: function(config) {
        var exclude;
        switch (typeof(config)) {
            case "string":
                (exclude = {})[config] = true;
                break;
            case "object":
                if (config.constructor === Array) {
                    exclude = {};
                    for (var i = 0, n = config.length, v; i < n; i++) {
                        v = config[i];
                        if (typeof(v) !== "string") throw "Invalid argument."
                        exclude[v] = true;
                    }
                }
                else exclude = config;
                break;
            case "undefined":
                exclude = null;
                break;
            default:
                throw "Invalid argument."
        }
        this._exclude = exclude;
    }
};

if (typeof(define) === "function" && !isUnd(define.amd)) define(function(){return Tokenizer;});
else global.Tokenizer = Tokenizer;

})(typeof(global)==="undefined" ? window : global);
