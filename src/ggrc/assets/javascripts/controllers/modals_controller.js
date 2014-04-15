/*!
    Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
    Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
    Created By: brad@reciprocitylabs.com
    Maintained By: brad@reciprocitylabs.com
*/

(function(can, $) {

can.Control("GGRC.Controllers.Modals", {
  BUTTON_VIEW_DONE : GGRC.mustache_path + "/modals/done_buttons.mustache"
  , BUTTON_VIEW_CLOSE : GGRC.mustache_path + "/modals/close_buttons.mustache"
//  BUTTON_VIEW_SAVE
  , BUTTON_VIEW_SAVE_CANCEL : GGRC.mustache_path + "/modals/save_cancel_buttons.mustache"
  , BUTTON_VIEW_SAVE_CANCEL_DELETE : GGRC.mustache_path + "/modals/save_cancel_delete_buttons.mustache"

  , defaults : {
    preload_view : GGRC.mustache_path + "/dashboard/modal_preload.mustache"
    , content_view : GGRC.mustache_path + "/help/help_modal_content.mustache"
    , header_view : GGRC.mustache_path + "/modals/modal_header.mustache"
    , button_view : null
    , model : null    // model class to use when finding or creating new
    , instance : null // model instance to use instead of finding/creating (e.g. for update)
    , new_object_form : false
    , mapping : false
    , find_params : {}
  }

  , init : function() {
    this.defaults.button_view = this.BUTTON_VIEW_DONE;
  }

  , confirm : function(options, success, dismiss) {
    var $target = $('<div class="modal hide"></div>');
    $target
    .modal({ backdrop: "static" })
    .ggrc_controllers_modals(can.extend({
      new_object_form : false
      , button_view : GGRC.mustache_path + "/modals/confirm_buttons.mustache"
      , modal_confirm : "Confirm"
      , modal_description : "description"
      , modal_title : "Confirm"
      , content_view : GGRC.mustache_path + "/modals/confirm.mustache" 
    }, options))
    .on('click', 'a.btn[data-toggle=confirm]', function(e) {
      $target.modal('hide').remove();
      success && success();
    })
    .on('click.modal-form.close', '[data-dismiss="modal"]', function() {
      $target.modal('hide').remove();
      dismiss && dismiss();
    });
  }
}, {
  init : function() {
    if (!(this.options instanceof can.Observe)) {
      this.options = new can.Observe(this.options);
    }

    if(!this.element.find(".modal-body").length) {
      can.view(this.options.preload_view, {}, this.proxy("after_preload"));
    } else {
      this.after_preload()
    }
    //this.options.attr("mapping", !!this.options.mapping);
  }

  , after_preload : function(content) {
    var that = this;
    if (content) {
      this.element.html(content);
    }
    this.options.attr("$header", this.element.find(".modal-header"));
    this.options.attr("$content", this.element.find(".modal-body"));
    this.options.attr("$footer", this.element.find(".modal-footer"));
    this.on();
    this.fetch_all()
      .then(this.proxy("apply_object_params"))
      .then(function() { 
        // If the modal is closed early, the element no longer exists
        that.element && that.element.trigger('preload') 
      })
      .then(this.proxy("autocomplete"));
  }

  , apply_object_params : function() {
    var self = this;

    if (this.options.object_params)
      this.options.object_params.each(function(value, key) {
        self.set_value({ name: key, value: value });
      });
  }

  , "input[data-lookup] focus" : function(el, ev) {
    this.autocomplete(el);
  }

  , autocomplete : function(el) {
    $.cms_autocomplete.call(this, el);
  }

  , autocomplete_select : function(el, event, ui) {
    var original_event;
    $('#extended-info').trigger('mouseleave'); // Make sure the extra info tooltip closes
    if(ui.item) {
      var path = el.attr("name").split(".")
        , instance = this.options.instance
        , index = 0
        , that = this
        , prop = path.pop();

      if (/^\d+$/.test(path[path.length - 1])) {
        index = parseInt(path.pop(), 10);
        path = path.join(".");
        if (!this.options.instance.attr(path)) {
          this.options.instance.attr(path, []);
        }
        this.options.instance.attr(path).splice(index, 1, ui.item.stub());
      }
      else {
        path = path.join(".");
        this.options.instance.attr(path, ui.item.stub());
        // Make sure person name/email gets written to the input field
        setTimeout(function(){
          if(el.val() === ""){
            // Setting el.val is needed for Auditor field to work
            var obj = that.options.instance.attr(path);
            if(obj && obj.type === "Person" && obj.type in CMS.Models && obj.id in CMS.Models[obj.type].cache){
              el.val(CMS.Models[obj.type].cache[obj.id].name || CMS.Models[obj.type].cache[obj.id].email);
            }
            instance._transient || instance.attr("_transient", new can.Observe({}));
            can.reduce(path.split("."), function(current, next) {
              current = current + "." + next;
              instance.attr(current) || instance.attr(current, new can.Observe({}));
              return current;
            }, "_transient");
            instance.attr("_transient." + path, ui.item[prop]);
          }
        }, 150);
      }
    } else {
      original_event = event;

      $(document.body).off(".autocomplete").one("modal:success.autocomplete", function(ev, new_obj) {
        el.data("ui-autocomplete").options.select(event, {item : new_obj});
      }).one("hidden", function() {
        setTimeout(function() {
          $(this).off(".autocomplete");
        }, 100);
      });
      while(original_event = original_event.originalEvent) {
        if(original_event.type === "keydown") {
          //This selection event was generated from a keydown, so click the add new link.
          el.data("ui-autocomplete").menu.active.find("a").click();
          break;
        }
      }
      return false;
    }
  }

  , immediate_find_or_create : function(el, ev, data) {
    var that = this
    , prop = el.data("drop")
    , model = CMS.Models[el.data("lookup")]
    , params = { context : that.options.instance.context && that.options.instance.context.serialize ? that.options.instance.context.serialize() : that.options.instance.context };

    setTimeout(function() {
      params[prop] = el.val();
      el.prop("disabled", true);
      model.findAll(params).then(function(list) {
        if(list.length) {
          that.autocomplete_select(el, ev, { item : list[0] });
        } else {
          new model(params).save().then(function(d) {
            that.autocomplete_select(el, ev, { item : d });
          });
        }
      })
      .always(function() {
        el.prop("disabled", false);
      });
    }, 100);
  }
  , "input[data-lookup][data-drop] paste" : "immediate_find_or_create"
  , "input[data-lookup][data-drop] drop" : "immediate_find_or_create"



  , fetch_templates : function(dfd) {
    var that = this;
    dfd = dfd ? dfd.then(function() { return that.options; }) : $.when(this.options);
    return $.when(
      can.view(this.options.content_view, dfd)
      , can.view(this.options.header_view, dfd)
      , can.view(this.options.button_view, dfd)
    ).done(this.proxy('draw'));
  }

  , fetch_data : function(params) {
    var that = this;
    var dfd;
    params = params || this.find_params();
    params = params && params.serialize ? params.serialize() : params;
    if (this.options.skip_refresh && this.options.instance) {
      return new $.Deferred().resolve(this.options.instance);
    }
    else if (this.options.instance) {
      dfd = this.options.instance.refresh();
    } else if (this.options.model) {
      dfd = this.options.new_object_form
          ? $.when(this.options.attr("instance", new this.options.model(params)))
          : this.options.model.findAll(params).then(function(data) {
            var h;
            if(data.length) {
              that.options.attr("instance", data[0]);
              return data[0].refresh(); //have to refresh (get ETag) to be editable.
            } else {
              that.options.attr("new_object_form", true);
              that.options.attr("instance", new that.options.model(params));
              return that.options.instance;
            }
          }).done(function() {
            // Check if modal was closed
            if(that.element !== null)
              that.on(); //listen to instance.
          });
    } else {
      this.options.attr("instance", new can.Observe(params));
      that.on();
      dfd = new $.Deferred().resolve(this.options.instance);
    }
    
    return dfd.done(function() {
      that.options.instance.form_preload && that.options.instance.form_preload(that.options.new_object_form);
    });
  }

  , fetch_all : function() {
    return this.fetch_templates(this.fetch_data(this.find_params()));
  }

  , find_params : function() {
    return this.options.find_params;
  }

  , draw : function(content, header, footer) {
    // Don't draw if this has been destroyed previously
    if (!this.element) {
      return;
    }

    can.isArray(content) && (content = content[0]);
    can.isArray(header) && (header = header[0]);
    can.isArray(footer) && (footer = footer[0]);

    header != null && this.options.$header.find("h2").html(header);
    content != null && this.options.$content.html(content).removeAttr("style");
    footer != null && this.options.$footer.html(footer);

    this.element.find('.wysihtml5').each(function() {
      $(this).cms_wysihtml5();
    });
    this.serialize_form();
  }

  , "input, textarea, select change" : function(el, ev) {
      this.set_value_from_element(el);
  }

  , "input:not([data-lookup]), textarea keyup" : function(el, ev) {
      if (el.prop('value').length == 0 || 
        (typeof el.attr('value') !== 'undefined' && el.attr('value').length == 0)) {
        this.set_value_from_element(el);
      }
  }

  , serialize_form : function() {
      var $form = this.options.$content.find("form")
        , $elements = $form.find(":input")
        ;

      can.each($elements.toArray(), this.proxy("set_value_from_element"));
    }

  , set_value_from_element : function(el) {
      var $el = $(el)
        , name = $el.attr('name')
        , value = $el.val()
        , that = this;
        ;

      if (name)
        this.set_value({ name: name, value: value });

      if($el.is("[data-also-set]")) {
        can.each($el.data("also-set").split(","), function(oname) {
          that.set_value({ name : oname, value : value});
        });
      }
    }

  , set_value: function(item) {
    // Don't set `_wysihtml5_mode` on the instances
    if (item.name === '_wysihtml5_mode')
      return;
    var instance = this.options.instance
      , that = this;
    if(!(instance instanceof this.options.model)) {
      instance = this.options.instance
               = new this.options.model(instance && instance.serialize ? instance.serialize() : instance);
    }
    var name = item.name.split(".")
      , $elem, value, model, $other;
    $elem = this.options.$content.find("[name='" + item.name + "']");
    model = $elem.attr("model");

    if (model) {
      if (item.value instanceof Array)
        value = can.map(item.value, function(id) {
          return CMS.Models.get_instance(model, id);
        });
      else
        value = CMS.Models.get_instance(model, item.value);
    } else if ($elem.is("[type=checkbox]")) {
      value = $elem.is(":checked");
    } else {
      value = item.value;
    }

    if ($elem.is("[null-if-empty]") && (!value || value.length === 0))
      value = null;

    if($elem.is("[data-binding]") && $elem.is("[type=checkbox]")){
      can.map($elem, function(el){
        if(el.value != value.id) 
          return;
        if($(el).is(":checked")){
          instance.mark_for_addition($elem.data("binding"), value);
        }
        else{
          instance.mark_for_deletion($elem.data("binding"), value);
        }
      });
      return;
    }
    else if($elem.is("[data-binding]")) {
      can.each(can.makeArray($elem[0].options), function(opt) {
        instance.mark_for_deletion($elem.data("binding"), CMS.Models.get_instance(model, opt.value));
      });
      if(value.push) {
        can.each(value, $.proxy(instance, "mark_for_addition", $elem.data("binding")));
      } else {
        instance.mark_for_addition($elem.data("binding"), value);
      }
    }

    if(name.length > 1) {
      if(can.isArray(value)) {
        value = new can.Observe.List(can.map(value, function(v) { return new can.Observe({}).attr(name.slice(1).join("."), v); }));
      } else {

        if($elem.is("[data-lookup]")) {
          name.pop(); //set the owner to null, not the email
          instance._transient || instance.attr("_transient", new can.Observe({}));
          can.reduce(name.slice(0, -1), function(current, next) {
            current = current + "." + next;
            instance.attr(current) || instance.attr(current, new can.Observe({}));
            return current;
          }, "_transient");
          instance.attr(["_transient"].concat(name).join("."), value);
          if(!value) {
            value = null;
          } else {
            // Setting a "lookup field is handled in the autocomplete() method"
            return;
          }
        } else if(name[name.length - 1] === "date") {
          name.pop(); //date is a pseudoproperty of datetime objects
          if(!value) {
            value = null;
          } else {
            value = this.options.model.convert.date(value);
            $other = this.options.$content.find("[name='" + name.join(".") + ".time']");
            if($other.length) {
              value = moment(value).add(parseInt($other.val(), 10)).toDate();
            }
          }
        } else if(name[name.length - 1] === "time") {
          name.pop(); //time is a pseudoproperty of datetime objects
          value = moment(this.options.instance.attr(name.join("."))).startOf("day").add(parseInt(value, 10)).toDate();
        } else {
          value = new can.Observe({}).attr(name.slice(1).join("."), value);
        }
      }
    }

    value = value && value.serialize ? value.serialize() : value;
    if ($elem.is('[data-list]')) {
      var list_path = name.slice(0, name.length-1).join(".")
        , cur = instance.attr(list_path)
        ;
      if (!cur || !(cur instanceof can.Observe.List)) {
        instance.attr(list_path, []);
        cur = instance.attr(list_path);
      }
      value = value || [];
      cur.splice.apply(cur, [0, cur.length].concat(value));
    } else {
      if(name[0] !== "people")
        instance.attr(name[0], value);
    }
  }

  , "[data-before], [data-after] change" : function(el, ev) {
    var start_date = el.datepicker('getDate');
    this.element.find("[name=" + el.data("before") + "]").datepicker({changeMonth: true, changeYear: true}).datepicker("option", "minDate", start_date);
    this.element.find("[name=" + el.data("after") + "]").datepicker({changeMonth: true, changeYear: true}).datepicker("option", "maxDate", start_date);
  }

  , "{$footer} a.btn[data-toggle='modal-submit'] click" : function(el, ev) {
    var that = this;

    // Normal saving process
    if (el.is(':not(.disabled)')) {
      var instance = this.options.instance
      , ajd;

      this.serialize_form();

      // Special case to handle context outside the form itself
      // - this avoids duplicated change events, and the API requires
      //   `context` to be present even if `null`, unlike other attributes
      if (!instance.context)
        instance.attr('context', { id: null });

      this.disable_hide = true;
      ajd = instance.save().done(function(obj) {
        function finish() {
          delete that.disable_hide;
          that.element.trigger("modal:success", [obj, {map_and_save: $("#map-and-save").is(':checked')}]).modal_form("hide");
        };

        // If this was an Objective created directly from a Section, create a join
        var params = that.options.object_params;
        if (obj instanceof CMS.Models.Objective && params && params.section) {
          new CMS.Models.SectionObjective({
            objective: obj
            , section: CMS.Models.Section.findInCacheById(params.section.id)
            , context: { id: null }
          }).save().done(function(){
            $(document.body).trigger("ajax:flash", 
                { success : "Objective mapped successfully." });
            finish(); 
          });
        } else {
          finish();
        }
      }).fail(function(xhr, status) {
        $(document.body).trigger("ajax:flash", { error : xhr.responseText });
        delete that.disable_hide;
      });
      this.bindXHRToButton(ajd, el, "Saving, please wait...");
    }
    // Queue a save if clicked after verifying the email address
    else if (this._email_check) {
      this._email_check.done(function(data) {
        if (data.length != null)
          data = data[0];
        if (data) {
          setTimeout(function() {
            delete that._email_check;
            el.trigger('click');
          }, 0);
        }
      });
    }
  }
  , " ajax:flash" : function(el, ev, mesg) {
    var that = this;
    this.options.$content.find(".flash").length || that.options.$content.prepend("<div class='flash'>");

    ev.stopPropagation();

    can.each(["success", "warning", "error", "progress"], function(type) {
      var tmpl;
      if(mesg[type]) {
        tmpl = '<div class="alert alert-'
        + type
        +'"><a href="#" class="close" data-dismiss="alert">&times;</a><span>'
        + mesg[type]
        + '</span></div>';
        that.options.$content.find(".flash").append(tmpl);
      }
    });
  }

  , "{instance} destroyed" : " hide"

  , " hide" : function(el, ev) {
      if(this.disable_hide) {
        ev.stopImmediatePropagation();
        ev.stopPropagation();
        ev.preventDefault();
        return false;
      }
      if (this.options.instance instanceof can.Model
          // Ensure that this modal was hidden and not a child modal
          && ev.target === this.element[0]
          && !this.options.skip_refresh
          && !this.options.instance.isNew()) {
        this.options.instance.refresh().then(this.proxy("open_created"));
      }
    }

  , open_created : function() {
    var instance = this.options.instance;
    if (instance instanceof CMS.Models.Response) {
      // Open newly created responses
      var object_type = instance.constructor.table_singular;
      $('[data-object-id="'+instance.id+'"][data-object-type="'+object_type+'"]')
        .find('.openclose').click().openclose("open");
    }
  }

  , destroy : function() {
    if(this.options.model && this.options.model.cache) {
      delete this.options.model.cache[undefined];
    }
    this._super && this._super.apply(this, arguments);
    if(this.options.instance && this.options.instance._transient) {
      this.options.instance.removeAttr("_transient");
    }
  }
});

})(window.can, window.can.$);
