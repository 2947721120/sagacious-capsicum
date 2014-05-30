#!/usr/bin/env bash

APPENGINE_INSTANCE=local
SETTINGS_MODULE="development app_engine ggrc_basic_permissions.settings.development ggrc_workflows.settings.development"
DATABASE_URI='mysql+mysqldb://root:root@localhost/ggrcdev?charset=utf8'
SECRET_KEY='Something-secret'
GOOGLE_ANALYTICS_ID=""
GOOGLE_ANALYTICS_DOMAIN=""
GAPI_KEY='<Google Browser Key>'
GAPI_CLIENT_ID='<Google OAuth Client ID>'
GAPI_ADMIN_GROUP='<Google Group Email Address>'
BOOTSTRAP_ADMIN_USERS='user@example.com'
RISK_ASSESSMENT_URL='http://localhost:8080'
