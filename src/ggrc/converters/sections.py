# Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
# Created By: dan@reciprocitylabs.com
# Maintained By: dan@reciprocitylabs.com

from .base import *

from ggrc.models import Directive, Section
from .base_row import *
from collections import OrderedDict

class SectionRowConverter(BaseRowConverter):
  model_class = Section

  def setup_object(self):
    self.obj = self.setup_object_by_slug(self.attrs)
    if self.obj.directive \
        and self.obj.directive is not self.importer.options.get('directive'):
          self.importer.errors.append('Slug code is already used.')
    else:
      self.obj.directive = self.importer.options.get('directive')
      if self.obj.id is not None:
        self.add_warning('slug', "Section already exists and will be updated")

  def reify(self):
    self.handle('slug', SlugColumnHandler)
    self.handle_date('created_at', no_import=True)
    self.handle_date('updated_at', no_import=True)
    self.handle_text_or_html('description')
    self.handle_text_or_html('notes')
    self.handle_raw_attr('reference_url')
    self.handle('contact', ContactEmailHandler, person_must_exist=True)
    self.handle('controls', LinkControlsHandler)
    self.handle_raw_attr('title', is_required=True)

  def save_object(self, db_session, **options):
    if options.get('directive_id'):
      self.obj.directive_id = int(options.get('directive_id'))
      db_session.add(self.obj)


class SectionsConverter(BaseConverter):

  metadata_export_order = ['type', 'slug']

  metadata_map = OrderedDict([
    ('Type','type'),
    ('Directive Code','slug'),
  ])

  object_export_order = [
    'slug', 'title', 'description',
    'controls', 'created_at', 'updated_at'
  ]

  object_map = OrderedDict([
    ('Section Code', 'slug'),
    ('Section Title', 'title'),
    ('Section Description' , 'description'),
    ('Notes', 'notes'),
    ('Reference URL', 'reference_url'),
    ('Map:Person of Contact', 'contact'),
    ('Controls', 'controls'),
    ('Created', 'created_at'),
    ('Updated', 'updated_at')
  ])

  row_converter = SectionRowConverter

  def validate_code(self, attrs):
    if not attrs.get('slug'):
      self.errors.append('Missing {} Code heading'.format(self.directive_kind()))
    elif attrs['slug'] != self.directive().slug:
      self.errors.append('{0} Code must be {1}'.format(
          self.directive_kind(),
          self.directive().slug
      ))

  # Creates the correct metadata_map for the specific directive kind.
  def create_metadata_map(self):
    if self.options.get('directive'):
      self.metadata_map = OrderedDict( [(k.replace("Directive", self.directive().type), v) if 'Directive' in k else (k, v) for k, v in self.metadata_map.items()] )

  # Called in case the object_map headers change amongst similar imports
  def create_object_map(self):
    if self.directive_kind() == "Contract":
      self.object_map = OrderedDict( [(k.replace("Section", "Clause"), v) \
                          if 'Section' in k else (k, v) for k, v in self.object_map.items()] )

  def directive_kind(self):
    return self.directive().kind or self.directive().meta_kind

  def directive(self):
    return self.options.get('directive')

  def do_export_metadata(self):
    yield self.metadata_map.keys()
    yield [self.directive().type, self.directive().slug]
    yield []
    yield []
    yield self.object_map.keys()

