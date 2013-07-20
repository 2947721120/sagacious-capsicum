/*
 * Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
 * Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
 * Created By:
 * Maintained By:
 */

(function(namespace, $, can) {

//chrome likes to cache AJAX requests for Mustaches.
var mustache_urls = {};
$.ajaxPrefilter(function( options, originalOptions, jqXHR ) {
  if ( /\.mustache$/.test(options.url) ) {
    if(mustache_urls[options.url]) {
      options.url = mustache_urls[options.url];
    } else {
      mustache_urls[options.url] = options.url += "?r=" + Math.random();
    }
  }
});

  Mustache.registerHelper("join", function() {
    var prop, context = this, ret, options = arguments[arguments.length - 1];

    switch(arguments.length) {
      case 1:
        break;
      case 2:
        typeof arguments[0] === 'string' ? prop = arguments[0] : context = arguments[0];
        break;
      default:
        prop = arguments[0];
        context = arguments[1];
    }
    if(!context) {
      ret =  "";
    } else if(context.length) {
      ret = $(context).map(function() { return prop ? (can.getObject(prop, this) || "").toString() : this.toString(); }).get().join(", ");
    } else {
      ret = prop ? (can.getObject(prop, context) || "").toString() : context.toString();
    }
    return ret;
  });

  var quickHash = function(str, seed) {
    var bitval = seed || 1;
    str = str || "";
    for(var i = 0; i < str.length; i++)
    {
      bitval *= str.charCodeAt(i);
      bitval = Math.pow(bitval, 7);
      bitval %= Math.pow(7, 37);
    }
    return bitval;
  }


  var getParentNode = function (el, defaultParentNode) {
    return defaultParentNode && el.parentNode.nodeType === 11 ? defaultParentNode : el.parentNode;
  }


    function isExtendedFalsy(obj) {
      return !obj 
        || (typeof obj === "object" && can.isEmptyObject(obj))
        || (obj.length != null && obj.length == 0) 
        || (obj.serialize && can.isEmptyObject(obj.serialize()));
    }

    function preprocessClassString(str) {
      var ret = []
      , src = str.split(" ");

      for(var i = 0; i < src.length; i++) {
        var expr = src[i].trim();
        if(expr.charAt(0) === "=") {
          ret.push({ attr : src[i].trim().substr(1) });
        } else if(expr.indexOf(":") > -1) {
          var spl = expr.split(":");
          var arr = [];
          for(var j = 0; j < spl.length - 1; j ++) {
            var inverse = spl[j].trim()[0] === "!"
            , attr_name = spl[j].trim().substr(inverse ? 1 : 0)
            
            arr.push({attr : attr_name, inverse : inverse});
          }
          arr.value = spl[spl.length - 1];
          ret.push(arr);
        } else {
          ret.push(expr);
        }
      }
      return ret;
    }

    function buildClassString(arr, context) {
      var ret = [];
      for(var i = 0; i < arr.length; i++) {
        if(typeof arr[i] === "string") {
          ret.push(arr[i]);
        } else if(typeof arr[i] === "object" && arr[i].attr) {
          ret.push(can.getObject(arr[i].attr, context));
        } else if(can.isArray(arr[i]) && arr[i].value) {
          var p = true;
          for(var j = 0; j < arr[i].length; j ++) {
            var attr = can.getObject(arr[i][j].attr, context);
            if(arr[i][j].inverse ? !isExtendedFalsy(attr) : isExtendedFalsy(attr)) {
              p = false;
              break;
            }
          }
          if(p) {
            ret.push(arr[i].value);
          }
        } else {
          throw "Unsupported class building expression: " + JSON.stringify(arr[i]);
        }
      }

      return ret.join(" ");
    }

  /**
  * helper withclass
  * puts a class string on the element, includes live binding:
  * usage:
  * {{#withclass 'class strings'}}<element>...</element>{{/withclass}}
  * {{{withclass 'class strings'}}} to apply to the parent element a la XSLT <xsl:attribute>. Note the triple braces!
  * Tokens usable in class strings:
  *  =attribute : add the value of the attribute as a class
  *  attribute:value : if attribute is truthy, add value to the classes
  *  !attribute:value : if attribute is falsy, add value
  *  attr1:!attr2:value : if attr1 is truthy and attr2 is falsy, add value
  *  plainstring : use this class literally
    *  
  */
  Mustache.registerHelper("withclass", function() {
    var options = arguments[arguments.length - 1]
    , exprs = preprocessClassString(arguments[0])
    , that = this.___st4ck ? this[this.length-1] : this
    , hash = quickHash(arguments[0], quickHash(that._cid)).toString(36)
    //, content = options.fn(this).trim()
    //, index = content.indexOf("<") + 1

    // while(content[index] != " ") {
    //   index++;
    // }
    function classbinding(el, ev, newVal, oldVal) {
      $(el).attr("class", buildClassString(exprs, this));
    }


    function hookupfunc(el, parent, view_id) {
      var content = options.fn(that);

      if(content) {
        var frag = can.view.frag(content, parent);
        var $newel = $(frag.querySelector("*"));
        el.parentNode ? el.parentNode.replaceChild($newel[0], el) : $(parent).append($newel);
        el = $newel[0];
      } else {
        //we are inside the element we want to add attrs to.
        var p = el.parentNode
        p.removeChild(el)
        el = p;
      }
      for(var i = 0; i < exprs.length; i ++) {
        var expr = exprs[i];
        if(typeof expr === "object" && expr.attr && that.bind) {
          that.bind(expr.attr + "." + hash, $.proxy(classbinding, that, el));
        } else if(can.isArray(expr) && expr.value && that.bind) {
          can.each(expr, function(attr_expr) {
            var attr_token = attr_expr.attr;
            that.bind(attr_token + "." + hash, $.proxy(classbinding, that, el));
          });
        }
      }
      classbinding.call(that, el);
      
    }
    return "<div" 
    + can.view.hook(hookupfunc)
    + " data-replace='true'/>";
  });

  /**
    Add a live bound attribute to an element, avoiding buggy CanJS attribute interpolations.
    Usage:
    {{#withattr attrname attrvalue attrname attrvalue...}}<element/>{{/withattr}} to apply to the child element
    {{{withattr attrname attrvalue attrname attrvalue...}}} to apply to the parent element a la XSLT <xsl:attribute>. Note the triple braces!
    attrvalue can take mustache tokens, but they should be backslash escaped.
  */
  Mustache.registerHelper("withattr", function() {
    var args = can.makeArray(arguments).slice(0, arguments.length - 1)
    , options = arguments[arguments.length - 1]
    , attribs = []
    , that = this.___st4ck ? this[this.length-1] : this
    , data = can.extend({}, that)
    , hash = quickHash(args.join("-"), quickHash(that._cid)).toString(36)
    , attr_count = 0;

    var hook = can.view.hook(function(el, parent, view_id) {
      var content = options.fn(that);

      if(content) {
        var frag = can.view.frag(content, parent);
        var $newel = $(frag.querySelector("*"));
        var newel = $newel[0];

        el.parentNode ? el.parentNode.replaceChild(newel, el) : $(parent).append($newel);
        el = newel;
      } else {
        //we are inside the element we want to add attrs to.
        var p = el.parentNode;
        p.removeChild(el);
        el = p;
      }

      function sub_all(el, ev, newVal, oldVal) {
        var $el = $(el);
        can.each(attribs, function(attrib) {
          $el.attr(attrib.name, $("<div>").html(can.view.render(attrib.value, data.serialize ? data.serialize() : data)).html());
        });
      }

      for(var i = 0; i < args.length - 1; i += 2) {
        var attr_name = args[i];
        var attr_tmpl = args[i + 1];
        //set up bindings where appropriate
        attr_tmpl = attr_tmpl.replace(/\{[^\}]*\}/g, function(match, offset, string) {
          var token = match.substring(1, match.length - 1);
          if(typeof data[token] === "function") {
            data[token].bind && data[token].bind("change." + hash, $.proxy(sub_all, that, el));
            data[token] = data[token].call(that);
          }

          that.bind && that.bind(token + "." + hash, $.proxy(sub_all, that, el));

          return "{" + match + "}";
        });
        can.view.mustache("withattr_" + hash + "_" + (++attr_count), attr_tmpl);
        attribs.push({name : attr_name, value : "withattr_" + hash + "_" + attr_count });
      }

      sub_all(el);

    });

    return "<div"
    + hook
    + " data-replace='true'/>";
  });


  var controlslugs = function() {
    var slugs = [];
    slugs.push((this.title && this.title.length > 15 )? this.title.substr(0, 15) + "..." : this.title);
    can.each(this.implementing_controls, function(val) {
      slugs.push.apply(slugs, controlslugs.call(this));
    });
    return slugs;
  }

  var countcontrols = function() {
    var slugs = [];
    can.each(this.linked_controls, function() {
      slugs.push.apply(slugs, controlslugs.apply(this)); 
    });
    return slugs.length;
  }

  Mustache.registerHelper("controlscount", countcontrols);

  Mustache.registerHelper("controlslugs", function() {
    var slugs = [];
    can.each(this.linked_controls, function() {
      slugs.push.apply(slugs, controlslugs.apply(this)); 
    });
    return slugs.join(arguments.length > 1 ? arguments[0] : " ");
  });

$.each({
	"rcontrols" : "RegControl"
	, "ccontrols" : "Control"
}, function(key, val) {
  Mustache.registerHelper(key, function(obj, options) {
    var implementing_control_ids = []
    , ctls_list = obj.linked_controls;

    can.each(ctls_list, function(ctl) {
      var ctl_model = namespace.CMS.Models[val].findInCacheById(ctl.id);
      if(ctl_model && ctl_model.implementing_controls && ctl_model.implementing_controls.length) {
        implementing_control_ids = implementing_control_ids.concat(
          can.map(ctl_model.implementing_controls, function(ictl) { return ictl.id })
        );
      }
    });

    return can.map(
      $(ctls_list).filter( 
        function() {
          return $.inArray(this.id, implementing_control_ids) < 0;
        })
      , function(ctl) { return options.fn({ foo_controls : namespace.CMS.Models[val].findInCacheById(ctl.id) }); }
    )
    .join("\n");
  });
});

Mustache.registerHelper("if_equals", function(val1, val2, options) {
  var that = this, _val1, _val2;
  function exec() {
    if(_val1 == _val2) return options.fn(that);
    else return options.inverse(that);
  }
    if(typeof val1 === "function") { 
      if(val1.isComputed) {
        val1.bind("change", function(ev, newVal, oldVal) {
          _val1 = newVal;
          return exec();
        });
      }
      _val1 = val1.call(this);
    } else {
      _val1 = val1;
    }
    if(typeof val2 === "function") { 
      if(val2.isComputed) {
        val2.bind("change", function(ev, newVal, oldVal) {
          _val2 = newVal;
          exec();
        });
      }
      _val2 = val2.call(this);
    } else {
      _val2 = val2;
    }

  return exec();
});

Mustache.registerHelper("if_null", function(val1, options) {
  var that = this, _val1;
  function exec() {
    if(_val1 == null) return options.fn(that);
    else return options.inverse(that);
  }
    if(typeof val1 === "function") { 
      if(val1.isComputed) {
        val1.bind("change", function(ev, newVal, oldVal) {
          _val1 = newVal;
          return exec();
        });
      }
      _val1 = val1.call(this);
    } else {
      _val1 = val1;
    }
  return exec();
});

can.each(["firstexist", "firstnonempty"], function(fname) {
  Mustache.registerHelper(fname, function() {
    var args = can.makeArray(arguments).slice(0, arguments.length - 1);
    for(var i = 0; i < args.length; i++) {
      var v = args[i];
      if(typeof v === "function") v = v.call(this);
      if(v != null && (fname === "firstexist" || !!(v.toString().trim().replace(/&nbsp;|\s|<br *\/?>/g, "")))) return v.toString();
    }
    return "";
  });
});

Mustache.registerHelper("pack", function() {
  var options = arguments[arguments.length - 1];
  var objects = can.makeArray(arguments).slice(0, arguments.length - 1);
  var pack = {};
  can.each(objects, function(obj, i) {
      if(typeof obj === "function") {
          objects[i] = obj = obj();
      }
    // if(obj instanceof can.Observe) {
    //   obj.bind("change", function(ev, attr, how, newVal, oldVal) {
    //     var tokens, idx, subobj;
    //     switch(how) {
    //     case "remove":
    //     case "add":
    //     tokens = attr.split(".");
    //     idx = tokens.pop();
    //     subobj = can.getObject(tokens.join("."), pack);
    //     subobj && (subobj instanceof can.Observe.List 
    //       ? subobj.splice.apply(subobj, how === "remove" ? [+idx, 1] : [+idx, 0, newVal])
    //       : pack.attr(attr, newVal));
    //     break;
    //     default:          
    //     pack.attr(attr, newVal);
    //     }
    //   });
    // }
    if(obj._data) {
      obj = obj._data;
    }
    for(var k in obj) {
      if(obj.hasOwnProperty(k)) {
        pack[k] = obj[k];
      }
    }
  });
  if(options.hash) {
    for(var k in options.hash) {
      if(options.hash.hasOwnProperty(k)) {
        pack[k] = options.hash[k];
      }
    }
  }
  //pack.attr("packed", pack.serialize()); //account for Can 1.1.3 not constructing context stack properly
  pack = new can.Observe(pack);
  var retval = options.fn(pack);
  return retval;
});


Mustache.registerHelper("is_beta", function(){
  var options = arguments[arguments.length - 1];
  if($(document.body).hasClass('BETA')) return options.fn(this);
  else return options.inverse(this);
});

Mustache.registerHelper("if_page_type", function(page_type, options) {
  var options = arguments[arguments.length - 1];
  if (window.location.pathname.split('/')[1] == page_type)
    return options.fn(this);
  else
    return options.inverse(this);
});

Mustache.registerHelper("render", function(template, context, options) {
  if(!options) {
    options = context;
    context = this;
  }

  if(typeof context === "function") {
    context = context();
  }

  if(typeof template === "function") {
    template = template();
  }

  return can.view.render(template, context.serialize ? context.serialize() : context);
});

Mustache.registerHelper("renderLive", function(template, context, options) {
  if(!options) {
    options = context;
    context = this;
  }

  if(typeof context === "function") {
    context = context();
  }

  if(typeof template === "function") {
    template = template();
  }

  return can.view.render(template, context);
});

function defer_render(tag_name, func) {
  var hook
    ;

  tag_name = tag_name || "span";

  function hookup(element, parent, view_id) {
    var f = function() {
      frag_or_html = func();
      $(element).after(frag_or_html).remove();
    };
    setTimeout(f, 13);
  }

  hook = can.view.hook(hookup);
  return ["<", tag_name, " ", hook, ">", "</", tag_name, ">"].join("");
}

Mustache.registerHelper("defer", function(tag_name, options) {
  var context = this;

  if (!options) {
    options = tag_name;
    tag_name = "span";
  }

  return defer_render(tag_name, function() {
    return options.fn(context);
  });
});

Mustache.registerHelper("pbc_is_read_only", function() {
  var options = arguments[arguments.length - 1];
  if (window.location.pathname.split('/')[1] == 'pbc_lists')
    return options.inverse(this);
  else
    return options.fn(this);
});

Mustache.registerHelper("with_line_breaks", function(content) { 
  var value = typeof content === "function" ? content() : content;
  if (value && value.search(/<\w+[^>]*>/) < 0)
    return value.replace(/\n/g, "<br />");
  else
    return value;
});

Mustache.registerHelper("show_expander", function() {
  var options = arguments[arguments.length - 1]
  , args = can.makeArray(arguments).slice(0, arguments.length - 1)
  , disjunctions = [[]]
  , not = false;
  for(var i = 0; i < args.length; i++) {
    if(args[i] === "||") {
      disjunctions.push([]);
    } else if (args[i] === "!") {
      not = true;
    } else {
      disjunctions[disjunctions.length - 1].push(not ? { not : args[i] } : args[i]);
      not = false;
    }
  }

  return can.reduce(disjunctions, function(a, b) {
    return a || can.reduce(b, function(c, d) {
      if(!c)
        return false;

      var not = !!d.not;
      d = d.not ? d.not : d;

      typeof d === "function" && (d = d());

      var pred = (d && (d.length == null || d.length > 0));
      if(not) pred = !pred;
      return pred;
    }, true);
  }, false) ? options.fn(this) : options.inverse(this);
});

Mustache.registerHelper("allow_help_edit", function() {
  var options = arguments[arguments.length - 1];
  return options.fn(this); //always true for now
});

Mustache.registerHelper("all", function(type, options) {
  var model = CMS.Models[type] || GGRC.Models[type]
  , $dummy_content = $(options.fn({}).trim()).first()
  , tag_name = $dummy_content.prop("tagName")
  , items_dfd, hook;

  function hookup(element, parent, view_id) {
    items_dfd.done(function(items){
      var $el = $(element);
      can.each(items, function(item) {
        $(can.view.frag(options.fn(item), parent)).appendTo(element.parentNode);
      });
      $el.remove();
    });
    return element.parentNode;
  }

  if($dummy_content.attr("data-view-id")) {
    can.view.hookups[$dummy_content.attr("data-view-id")] = hookup;
  } else {
    hook = can.view.hook(hookup);
    $dummy_content.attr.apply($dummy_content, can.map(hook.split('='), function(s) { return s.replace(/'|"| /, "");}));
  }

  if(model.cache) {
    items_dfd = $.when(can.map(Object.keys(model.cache), function(idx) { return model.cache[idx]; }));
  } else {
    items_dfd = model.findAll();
  }
  return "<" + tag_name + " data-view-id='" + $dummy_content.attr("data-view-id") + "'></" + tag_name + ">";
});

Mustache.registerHelper("handle_context", function() {
  var context_href = this.attr('context.href')
    , context_id = this.attr('context.id')
    ;

  return [
    "<input type='hidden' name='context.href'" +
      (context_href ? ("value='" + context_href + "'") : "") +
      " null-if-empty='null-if-empty' />",
    "<input type='hidden' name='context.id'" +
      (context_id ? ("value='" + context_id + "'") : "") +
      " null-if-empty='null-if-empty' numeric='numeric' />"
    ].join("\n");
});

})(this, jQuery, can);

Mustache.registerHelper("with_page_object_as", function(name, options) {
  if(!options) {
    options = name;
    name = "page_object";
  }
  var page_object = GGRC.make_model_instance(GGRC.page_object);
  if(page_object) {
    var p = {};
    p[name] = page_object;
    options.contexts.push(p);
    return options.fn(options.contexts);
  } else {
    return options.inverse(options.contexts);
  }
});

Mustache.registerHelper("role_checkbox", function(role, model, operation) {
  return [
    '<input type="checkbox" name="permissions."'
    , operation
    , '" value="'
    , model.model_singular
    , '"'
    , role.allowed(operation, model) ? ' checked="checked"' : ''
    , '>'
  ].join("");
});

Mustache.registerHelper("private_program", function(modal_title) {
  return modal_title.indexOf("New ") !=0 ? '' : [
    '<div class="span6">'
    , '<label>'
    , 'Privacy'
    , '<i class="grcicon-help-black" rel="tooltip" title="Program won\'t be visible to others"></i>'
    , '</label>'
    , '<div class="checkbox-area">'
    , '<input name="private" value="private" type="checkbox"> Private Program'
    , '</div>'
    , '</div>'
  ].join("");
});


Mustache.registerHelper("can_link_to_page_object", function(context, options) {
  if(!options) {
    options = context;
    context = options.contexts ? options.contexts[options.contexts.length - 1] : this;
  }

  var page_type = GGRC.infer_object_type(GGRC.page_object);

  if(page_type.links_to[context.constructor.model_singular] || ~can.inArray(context.constructor.model_singular, page_type.links_to)) {
    return options.fn(options.contexts);
  } else {
    return options.inverse(options.contexts);
  }
});

