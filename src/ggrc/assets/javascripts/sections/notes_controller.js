/*!
    Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
    Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
    Created By: brad@reciprocitylabs.com
    Maintained By: brad@reciprocitylabs.com
*/

//= require can.jquery-all

can.Control("CMS.Controllers.SectionNotes", {
  defaults : {
    edit_view : "/static/mustache/sections/edit_notes.mustache"
    , show_view : "/static/mustache/sections/show_notes.mustache"
    , model_instance : null
    , model_class : CMS.Models.Section
    , section_id : null
  }
}, {
  
  init : function() {
    this.draw_edit();
  }

  , update : function() {
    this.draw_edit();
  }

  , draw_edit : function() {
    var that = this;
    if(!this.options.model_instance) {
      this.original_value =  this.element.find(".note-content .rtf").html();
    }
    can.view(this.options.edit_view, this.options.model_instance || { notes : this.original_value}, function(frag) {
      that.element.html(frag)
      .find(".wysihtml5").cms_wysihtml5();
    });
  }

  , draw_notes : function(el, ev) {
    var that = this;

    can.view(this.options.show_view, this.options.model_instance || { notes : this.original_value }, function(frag) {
      that.element.html(frag)
    });
  }

  , ".wysihtml5-toolbar a click" : function(el, ev) {
  }

  , ".btn-add click" : function(el, ev) {
    if(!this.options.model_instance) {
      this.options.model_instance = new this.options.model_class({id : this.options.section_id});
    }
    this.options.model_instance.attr("notes", this.element.find(".wysihtml5").data().wysihtml5.editor.currentView.getValue());
    this.options.model_instance.save().done(this.proxy("draw_notes")); 
  }

  , ".cancel-link click" : "draw_notes"

  , " click" : function(el, ev) {
    if(!el.find(".note-content, .note-trigger").length)
      ev.stopPropagation(); // Don't collapse on click while the notes editor is open.
  }
});
