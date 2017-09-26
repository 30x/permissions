import requests
import base64
import json
from os import environ as env
from urlparse import urljoin
import sys

ANYONE = 'http://apigee.com/users#anyone'

BASE_URL = '%s://%s:%s' % (env['EXTERNAL_SCHEME'], env['EXTERNAL_SY_ROUTER_HOST'], env['EXTERNAL_SY_ROUTER_PORT']) if 'EXTERNAL_SY_ROUTER_PORT' in env else '%s://%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'])

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

USER_TOKEN = env['USER_TOKEN']
USER_CLAIMS = json.loads(b64_decode(USER_TOKEN.split('.')[1]))
USER = '%s#%s' % (USER_CLAIMS['iss'], USER_CLAIMS['sub'])
USER_E = USER.replace('#', '%23')

CLIENT_TOKEN = env['CLIENT_TOKEN']
CLIENT_TOKEN_CLAIMS = json.loads(b64_decode(CLIENT_TOKEN.split('.')[1]))
CLIENT_TOKEN_ISSUER = CLIENT_TOKEN_CLAIMS['iss']
CLIENT_ID = '%s#%s' % (CLIENT_TOKEN_ISSUER, CLIENT_TOKEN_CLAIMS['sub'])
CLIENT_ID_E = CLIENT_TOKEN.replace('#', '%23')
GLOBAL_GOVS_IDS = [CLIENT_TOKEN_ISSUER + '#' + id for id in env['GLOBAL_GOVS'].split()]

def get_headers(token):
    rslt = {'Accept': 'application/json'}
    rslt['Authorization'] = 'Bearer %s' % token
    return rslt

def post_team_headers(token):
    rslt = get_headers(token)
    rslt['Content-Type'] = 'application/json'
    return rslt

def post_permissions_headers(token):
    rslt = get_headers(token)
    rslt['Content-Type'] = 'application/json'
    rslt['X-Client-Authorization'] = 'Bearer %s' % CLIENT_TOKEN
    return rslt

def patch_headers(token, if_match):
    rslt = get_headers(token)
    rslt['Content-Type'] = 'application/merge-patch+json'
    rslt['If-Match'] = if_match
    return rslt

def main():

    team = {
        'isA': 'Team',
        'name': 'Global Governors',
        '_permissions': {
            '_inheritsPermissionsOf': '/',
            '_self': {
                'update': [''],
                'read': [''],
                'delete': [''],
                'admin': [''],
                'govern': ['']
                }
            },
        'members': GLOBAL_GOVS_IDS
        }
    headers = post_team_headers(USER_TOKEN)
    teams_url = urljoin(BASE_URL, '/az-teams')
    r = requests.post(teams_url, headers=headers, json=team)
    if r.status_code == 201:
        GLOBAL_GOVS = r.headers['location']
        print 'correctly created "global governors" team %s etag: %s' % (GLOBAL_GOVS, r.headers['Etag'])
    else:
        print 'failed to create global governors team %s %s %s - cannot continue' % (teams_url, r.status_code, r.text)
        sys.exit(1)

    headers = get_headers(USER_TOKEN)
    url = urljoin(BASE_URL, '/az-permissions?/')
    r = requests.get(url , headers=headers)
    if r.status_code == 200:
        print 'correctly retrieved /az-permissions?/ etg: %s' % r.headers['Etag']
        slash_etag = r.headers['Etag']
    else:
        print 'failed to retrieve /az-permissions?/ %s %s' % (r.status_code, r.text)
        sys.exit(1)

    permissions_patch = {
        '_self': {
            'update': [GLOBAL_GOVS],
            'read': [GLOBAL_GOVS],
            'admin': [GLOBAL_GOVS],
            'govern': [GLOBAL_GOVS]
        },
        '_permissionsHeirs': {
            'read': [GLOBAL_GOVS],
            'add': [GLOBAL_GOVS],
            'remove': [GLOBAL_GOVS]
        },
        'az-permissions': {
            'read': [CLIENT_ID, GLOBAL_GOVS],
            'create': [CLIENT_ID, GLOBAL_GOVS]
        },
        'az-teams': {
            'read': [GLOBAL_GOVS]
            # create is not mentioned because anyone can make one
        },
        'dir-directories': {
            'read': [GLOBAL_GOVS],
            'create': [GLOBAL_GOVS]
        },
        'name-entries': {
            'read': [GLOBAL_GOVS],
            'create': [GLOBAL_GOVS]
        }        
    }
    headers = patch_headers(USER_TOKEN, slash_etag)
    r = requests.patch(url, headers=headers, json=permissions_patch)
    if r.status_code == 200:
        print 'correctly patched permissions for /'
    else:
        print 'failed to patch permissions for / %s %s' % (r.status_code, r.text)
        sys.exit(1)

    permissions = {
        '_subject': '/az-well-known-teams',
        '_inheritsPermissionsOf': '/',
        '_self': {
            'read': [ANYONE]
            }
        }
    headers = post_permissions_headers(USER_TOKEN)
    url = urljoin(BASE_URL, '/az-permissions')
    r = requests.post(url, headers=headers, json=permissions)
    if r.status_code == 201:
        print 'correctly created permissions for /az-well-known-teams'
    elif r.status_code == 409:
        print 'permissions for /az-well-known-teams already exists'
    else:
        print 'failed to create permissions for /az-well-known-teams %s %s' % (r.status_code, r.text)
        sys.exit(1)

    well_known_teams_patch = {
        'global-govs': GLOBAL_GOVS
        }
    headers = patch_headers(USER_TOKEN, None)
    url = urljoin(BASE_URL, '/az-well-known-teams')
    r = requests.patch(url, headers=headers, json=well_known_teams_patch)
    if r.status_code == 200:
        print 'correctly patched /az-well-known-teams'
    else:
        print 'failed to patch /az-well-known-teams %s %s' % (r.status_code, r.text)
        sys.exit(1)

if __name__ == '__main__':
    main()
