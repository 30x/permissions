import requests
import base64
import json
from os import environ as env
from urlparse import urljoin

ANYONE = 'http://apigee.com/users/anyone'

BASE_URL = '%s://%s:%s' % (env['EXTERNAL_SCHEME'], env['EXTERNAL_SY_ROUTER_HOST'], env['EXTERNAL_SY_ROUTER_PORT']) if 'EXTERNAL_SY_ROUTER_PORT' in env else '%s://%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'])
SYS_GOVS_IDS = json.loads(env['SYS_GOVS_IDS'])

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

if 'APIGEE_TOKEN1' in env:
    TOKEN1 = env['APIGEE_TOKEN1']
else:
    with open('token.txt') as f:
        TOKEN1 = f.read()
USER1_CLAIMS = json.loads(b64_decode(TOKEN1.split('.')[1]))      
USER1 = '%s#%s' % (USER1_CLAIMS['iss'], USER1_CLAIMS['sub'])
USER1_E = USER1.replace('#', '%23')

if 'CLIENT_TOKEN' in env:
    CLIENT_TOKEN = env['CLIENT_TOKEN']
else:
    with open('client-token.txt') as f:
        CLIENT_TOKEN = f.read()
CLIENT_TOKEN_CLAIMS = json.loads(b64_decode(CLIENT_TOKEN.split('.')[1]))      
CLIENT_ID = '%s#%s' % (CLIENT_TOKEN_CLAIMS['iss'], CLIENT_TOKEN_CLAIMS['sub'])
CLIENT_ID_E = CLIENT_TOKEN.replace('#', '%23')

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
        'name': 'System Governors',
        '_permissions': {
            '_self': {
                'update': [''],
                'read': [''],
                'delete': [''],
                'admin': [''],
                'govern': ['']            
                }
            },
        'members': SYS_GOVS_IDS
        }
    headers = post_team_headers(TOKEN1)
    teams_url = urljoin(BASE_URL, '/teams') 
    r = requests.post(teams_url, headers=headers, json=team)
    if r.status_code == 201:
        SYS_GOVS = r.headers['location']
        print 'correctly created "system governors" team %s etag: %s' % (SYS_GOVS, r.headers['Etag'])
    else:
        print 'failed to create system governors team %s %s - cannot continue' % (r.status_code, r.text)
        return

    headers = get_headers(TOKEN1)
    url = urljoin(BASE_URL, '/permissions?/')
    r = requests.get(url , headers=headers)
    if r.status_code == 200:
        print 'correctly retrieved /permissions?/ etg: %s' % r.headers['Etag'] 
        slash_etag = r.headers['Etag'] 
    else:
        print 'failed to retrieve /permissions?/ %s %s' % (r.status_code, r.text)
        return

    permissions_patch = {
        '_self': {
            'update': [SYS_GOVS],
            'read': [SYS_GOVS],
            'delete': [SYS_GOVS],
            'admin': [SYS_GOVS],
            'govern': [SYS_GOVS]
            },
        'permissions': {
            'read': [SYS_GOVS],
            'create': [CLIENT_ID]
            }
        }
    headers = patch_headers(TOKEN1, slash_etag)
    r = requests.patch(url, headers=headers, json=permissions_patch)
    if r.status_code == 200:
        print 'correctly patched permissions for /' 
    else:
        print 'failed to patch permissions for / %s %s' % (r.status_code, r.text)
        return

    permissions = {
        '_subject': '/teams-well-known',
        '_self': {
            'update': [SYS_GOVS, CLIENT_ID],
            'read': [ANYONE],
            'admin': [SYS_GOVS],
            'govern': [SYS_GOVS]
            }
        }
    headers = post_permissions_headers(TOKEN1)
    url = urljoin(BASE_URL, '/permissions')
    r = requests.post(url, headers=headers, json=permissions)
    if r.status_code == 201:
        print 'correctly created permissions for /teams-well-known' 
    else:
        print 'failed to create permissions for /teams-well-known %s %s' % (r.status_code, r.text)
        return

    well_known_teams_patch = {
        'sys_govs': SYS_GOVS
        }
    headers = patch_headers(TOKEN1, None)
    url = urljoin(BASE_URL, '/teams-well-known')
    r = requests.patch(url, headers=headers, json=well_known_teams_patch)
    if r.status_code == 200:
        print 'correctly patched /teams-well-known' 
    else:
        print 'failed to patch /teams-well-known %s %s' % (r.status_code, r.text)
        return

if __name__ == '__main__':
    main()