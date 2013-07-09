import csv
from .common import *



class BaseConverter(object):

  def __init__(self, rows_or_objects, **options):

    self.options = options.copy()
    self.objects = []
    self.rows = rows_or_objects[:]

    self.all_objects = {}
    self.errors = []
    self.warnings = []
    self.slugs = []
    self.final_results = []

  def results(self):
    return self.objects

  def add_slug_to_slugs(self, slug):
    self.slugs.append(slug)

  def get_slugs(self):
    return self.slugs

  def find_object(self, model_class, key):
    all_model_objs = self.all_objects.get(model_class.__class__.__name__)
    return all_model_objs.get(key) if all_model_objs else None

  def add_object(self, model_class, key, newObject):
    self.all_objects[model_class.__name__] = self.all_objects.setdefault(model_class.__name__, dict())
    self.all_objects[model_class.__name__][key] = newObject

  def created_objects(self):
    return [result for result in self.objects if result.id is None]

  def updated_objects(self):
    pass

  def changed_objects(self):
    pass

  def has_errors(self):
    return bool(len(self.errors)) or has_object_errors()

  def has_object_errors(self):
    for obj in self.objects:
      if obj.has_errors(): return True
    return False

  def has_warnings(self):
    return bool(len(self.warnings)) or has_object_warnings()

  def has_object_warnings(self):
   for obj in self.objects:
      if obj.has_warnings(): return True
   return False

  # Currently bypassing this method because python makes it easy to send the
  # list of lists (rows) to from_rows
  @classmethod
  def from_string(cls, csv_string, option = None):
    print 'Method call: (from_string) for class: {0}'.format(cls.__name__)

  @classmethod
  def from_rows(cls, rows, **options):
    print 'Attempting to create a: ' + cls.__name__ + ' object from rows!'
    return cls(rows, **options)

  def import_metadata(self):
    if len(self.rows) < 5:
      self.errors.append("There must be at least 5 input lines")
      raise ImportException # Should be caught by handle_csv_import
    headers = self.read_headers(self.metadata_map, self.rows.pop(0))
    print '{:-^40}'.format(' METADATA HEADERS ')
    pprint(headers)
    values = self.read_values(headers, self.rows.pop(0))
    print '{:-^40}'.format(' METADATA VALUES ')
    pprint(values)
    self.rows.pop(0)
    self.rows.pop(0)
    # TODO: Implement validation (absent in rails version as well?)
    self.validate_metadata(values)

  def read_values(self, headers, row):
    attrs = dict(zip(headers, row))
    return attrs

  def get_header_for_column(self, column_name):
    for header in self.object_map:
      return header if self.object_map[header] == column_name else ''

  def read_headers(self, import_map, row):
    ignored_colums = []
    self.trim_list(row)
    keys = []
    for heading in row:
      heading = heading.strip()
      if heading == "<skip>":
        continue
      elif not (heading in import_map):
        ignored_colums.append(heading)
        continue
      else:
        keys.append(import_map[heading])

    if len(ignored_colums):
      ignored_text = ", ".join(ignored_colums)
      self.warnings.append("Ignored column{plural}: {ignored_text}".format(
        plural='s' if len(ignored_colums) > 1 else '', ignored_text=ignored_text))

    missing_columns = import_map.values()
    for element in keys:
      missing_columns.remove(element)

    print "HERE ARE THE MISSING COLUMNS:"
    pprint(missing_columns)

    if len(missing_columns):
      missing_text = ", ".join([self.get_header_for_column(col) for col in missing_columns])
      self.warnings.append("Missing column{plural}: {missing}".format(
        plural='s' if len(missing_columns) > 1 else '', missing = missing_text))

    return keys

  def trim_list(self, a):
    while len(a) > 0 and self.isblank(a[-1]):
      a.pop()

  def isblank(self, string):
    return not len(string) or string.isspace()

  def do_import(self, dry_run = True):
    print '\n{:-^40}'.format(' IMPORTING ')
    self.import_metadata()
    object_headers = self.read_headers(self.object_map, self.rows.pop(0))
    print '{:-^40}'.format(' OBJECT HEADERS: ')
    pprint(object_headers)
    row_attrs = self.read_objects(object_headers, self.rows)
    print '{:-^40}'.format(' WARNINGS: ')
    pprint(self.warnings)
    print '{:-^40}'.format(' ROW ATTRIBUTES ')
    pprint(row_attrs)



    for index, row_attrs in enumerate(row_attrs):
      row = self.row_converter(self, row_attrs, index)
      row.setup()
      self.final_results.append(row.reify())
      self.objects.append(row)



    if not dry_run:
      pass # TODO: Add save here

    print '{:-^40}'.format(' END OF IMPORT ')
    return self


  def read_objects(self, headers, rows):
    attrs_collection = []
    for row in rows:
      if not len(row):
        continue
      attrs_collection.append(self.read_values(headers, row))
    return attrs_collection

  def validate_metadata(self, attrs):
    pass

  def validate_metadata_type(attrs, type):
    pass

  # FIXME: Provide a way to save all the objects
  def save():
    pass

  def do_export():
    pass

  def metadata_map(self):
    return self.__class__.metadata_map

  @classmethod
  def metadata_map():
    return self.metadata_map

  def object_map():
    return self.__class__.object_map()

  @classmethod
  def object_map():
    return self.__class__.object_map

  def row_converter():
    return self.__class__.row_converter()

  @classmethod
  def row_converter():
    return self.__class__.row_converter


