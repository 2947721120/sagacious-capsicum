# Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
# Created By: david@reciprocitylabs.com
# Maintained By: david@reciprocitylabs.com

from ggrc import db
from ggrc.models.all_models import all_models
from ggrc.models.object_person import ObjectPerson
from ggrc.models.object_owner import ObjectOwner
from ggrc.models.request import Request
from ggrc.models.response import Response
from ggrc_basic_permissions.models import UserRole
from ggrc.rbac import permissions, context_query_filter
from sqlalchemy import event, and_, or_, text, literal, union, alias
from sqlalchemy.schema import DDL
from .sql import SqlIndexer

class MysqlRecordProperty(db.Model):
  __tablename__ = 'fulltext_record_properties'
  __table_args__ = {'mysql_engine': 'myisam'}

  key = db.Column(db.Integer, primary_key=True)
  type = db.Column(db.String(64), primary_key=True)
  context_id = db.Column(db.Integer)
  tags = db.Column(db.String)
  property = db.Column(db.String(64), primary_key=True)
  content = db.Column(db.Text)

event.listen(
    MysqlRecordProperty.__table__,
    'after_create',
    DDL('ALTER TABLE {tablename} ADD FULLTEXT INDEX {tablename}_text_idx '
      '(content)'.format(tablename=MysqlRecordProperty.__tablename__))
    )

class MysqlIndexer(SqlIndexer):
  record_type = MysqlRecordProperty

  def _get_type_query(
      self, types=None, permission_type='read', permission_model=None):
    model_names = [model.__name__ for model in all_models]
    if types is not None:
      model_names = [m for m in model_names if m in types]

    type_queries = []
    for model_name in model_names:
      type_query = None
      if permission_type == 'read':
        contexts = permissions.read_contexts_for(
            permission_model or model_name)
      elif permission_type == 'create':
        contexts = permissions.create_contexts_for(
            permission_model or model_name)
      elif permission_type == 'update':
        contexts = permissions.update_contexts_for(
            permission_model or model_name)
      elif permission_type == 'delete':
        contexts = permissions.delete_contexts_for(
            permission_model or model_name)

      if permission_model and contexts:
        contexts = set(contexts) & set(
            permissions.read_contexts_for(model_name))

      type_query = and_(
          MysqlRecordProperty.type == model_name,
          context_query_filter(MysqlRecordProperty.context_id, contexts))
      type_queries.append(type_query)

    return and_(
        MysqlRecordProperty.type.in_(model_names),
        or_(*type_queries))

  def _get_filter_query(self, terms):
    whitelist = MysqlRecordProperty.property.in_(['title', 'name', 'email'])
    if not terms:
      return whitelist
    elif terms:
      return and_(whitelist, MysqlRecordProperty.content.contains(terms))

    # FIXME: Temporary (slow) fix for words shorter than MySQL default limit
    # elif len(terms) < 4:
    #   return MysqlRecordProperty.content.contains(terms)
    # else:
    #   return MysqlRecordProperty.content.match(terms)

  # filters by "myview" for a given person
  def _add_owner_query(self, query, types=None, contact_id=None):
    '''
    Finds all objects which might appear on a user's Profile or Dashboard
    pages, including:

      Objects mapped via ObjectPerson
      Objects owned via ObjectOwner
      Objects in private contexts via UserRole (e.g. for Private Programs)
      Objects for which the user is the "contact"
      Objects for which the user is the "primary_assessor" or "secondary_assessor"
      Audits for which the user is assigned a Request or Response

    This method only *limits* the result set -- Contexts and Roles will still
    filter out forbidden objects.
    '''
    if not contact_id:
      return query

    models = all_models
    if types is not None:
      models = [model for model in all_models if model.__name__ in types]

    model_names = [model.__name__ for model in models]

    type_union_queries = []

    # Objects to which the user is "mapped"
    object_people_query = db.session.query(
        ObjectPerson.personable_id.label('id'),
        ObjectPerson.personable_type.label('type'),
        literal(None).label('context_id')
      ).filter(
          and_(
            ObjectPerson.person_id == contact_id,
            ObjectPerson.personable_type.in_(model_names)
          )
      )
    type_union_queries.append(object_people_query)

    # Objects for which the user is an "owner"
    object_owners_query = db.session.query(
        ObjectOwner.ownable_id.label('id'),
        ObjectOwner.ownable_type.label('type'),
        literal(None).label('context_id')
      ).filter(
          and_(
            ObjectOwner.person_id == contact_id,
            ObjectOwner.ownable_type.in_(model_names),
          )
      )
    type_union_queries.append(object_owners_query)

    # Objects in a private context in which the user may have permissions
    context_query = db.session.query(
        literal(None).label('id'),
        literal(None).label('type'),
        UserRole.context_id.label('context_id')
      ).filter(
          and_(
            UserRole.person_id == contact_id,
            UserRole.context_id != None
          )
      )
    type_union_queries.append(context_query)

    for model in models:
      model_name = model.__name__
      # Audits where the user is assigned a Request or a Response
      if model_name == "Audit":
        model_type_query = db.session.query(
            Request.audit_id.label('id'),
            literal("Audit").label('type'),
            literal(None).label('context_id')
          ).join(Response).filter(
              or_(
                Request.assignee_id == contact_id,
                Response.contact_id == contact_id
              )
          ).distinct()
        type_union_queries.append(model_type_query)

      # Objects for which the user is the "contact"
      if hasattr(model, 'contact_id'):
        model_type_query = db.session.query(
            model.id.label('id'),
            literal(model.__name__).label('type'),
            literal(None).label('context_id')
          ).filter(
              model.contact_id == contact_id
          ).distinct()
        type_union_queries.append(model_type_query)

      # Objects for which the user is an assessor
      if hasattr(model, 'principal_assessor_id') or hasattr(model, 'secondary_assessor_id'):
        assessor_queries = []
        if hasattr(model, 'principal_assessor_id'):
          assessor_queries.append(or_(model.principal_assessor_id == contact_id))
        if hasattr(model, 'secondary_assessor_id'):
          assessor_queries.append(or_(model.secondary_assessor_id == contact_id))

        model_type_query = db.session.query(
            model.id.label('id'),
            literal(model.__name__).label('type'),
            literal(None).label('context_id')
          ).filter(
              or_(*assessor_queries)
          ).distinct()
        type_union_queries.append(model_type_query)

    # Construct and JOIN to the UNIONed result set
    type_union_query = alias(union(*type_union_queries))
    query = query.join(
        type_union_query,
        or_(
          and_(
            type_union_query.c.id == MysqlRecordProperty.key,
            type_union_query.c.type == MysqlRecordProperty.type),
          and_(
            type_union_query.c.context_id != None,
            type_union_query.c.context_id == MysqlRecordProperty.context_id
          )
        )
      )

    return query

  def search(
      self, terms, types=None, permission_type='read', permission_model=None, contact_id=None):
    query = db.session.query(self.record_type)
    query = query.filter(
        self._get_type_query(types, permission_type, permission_model))
    query = query.filter(self._get_filter_query(terms))
    query = self._add_owner_query(query, types, contact_id)
    query = query.order_by('fulltext_record_properties.content')
    return query

  def counts(self, terms, group_by_type=True, types=None, contact_id=None):
    from sqlalchemy import func, distinct

    query = db.session.query(
        self.record_type.type, func.count(distinct(self.record_type.key)))
    query = query.filter(self._get_type_query(types))
    query = query.filter(self._get_filter_query(terms))
    query = self._add_owner_query(query, types, contact_id)
    query = query.group_by(self.record_type.type)
    # FIXME: Is this needed for correct group_by/count-distinct behavior?
    #query = query.order_by(self.record_type.type, self.record_type.key)
    return query.all()

Indexer = MysqlIndexer
