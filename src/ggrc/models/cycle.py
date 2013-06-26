
# Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
# Created By:
# Maintained By:

from ggrc import db
from .mixins import Base, Described
from .object_document import Documentable
from .object_person import Personable

class Cycle(Documentable, Personable, Base, Described, db.Model):
  __tablename__ = 'cycles'

  start_at = db.Column(db.Date)
  complete = db.Column(db.Boolean, default=False, nullable=False)
  title = db.Column(db.String)
  audit_firm = db.Column(db.String)
  audit_lead = db.Column(db.String)
  status = db.Column(db.String)
  notes = db.Column(db.Text)
  end_at = db.Column(db.Date)
  program_id = db.Column(db.Integer, db.ForeignKey('programs.id'), nullable=False)
  report_due_at = db.Column(db.Date)
  pbc_lists = db.relationship('PbcList', backref='audit_cycle', cascade='all, delete-orphan')

  _publish_attrs = [
      'start_at',
      'complete',
      'title',
      'audit_firm',
      'audit_lead',
      'status',
      'notes',
      'end_at',
      'program',
      'report_due_at',
      'pbc_lists',
      ]
