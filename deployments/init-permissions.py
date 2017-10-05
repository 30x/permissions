import requests
import base64
import json
from os import environ as env
from urlparse import urljoin
import sys

ANYONE = 'http://apigee.com/users#anyone'

PERMISSIONS_BASE = env['PERMISSIONS_BASE']

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

def post_headers(token):
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

def create_directory(permissions):
    directory = {
        'kind': 'directory',
        '_permissions': permissions,
        }
    headers = post_headers(USER_TOKEN)
    directories_url = urljoin(PERMISSIONS_BASE, '/dir-directories')
    r = requests.post(directories_url, headers=headers, json=directory)
    if r.status_code == 201:
        print 'correctly created directory %s, etag: %s' % (r.headers['location'], r.headers['Etag'])
        return r.headers['location'], r.headers['etag']
    else:
        print 'failed to create directory %s %s %s - cannot continue' % (directories_url, r.status_code, r.text)
        return None, None

def create_entry(namespace, name, namedResource):
    entry = {
        'kind': 'Entry',
        'namespace': namespace,
        'name': name,
        'namedResource': namedResource
    }
    headers = post_headers(USER_TOKEN)
    entries_url = urljoin(PERMISSIONS_BASE, '/name-entries')
    r = requests.post(entries_url, headers=headers, json=entry)
    if r.status_code == 201:
        print 'correctly created entry %s named %s, etag: %s' % (r.headers['location'], name, r.headers['Etag'])
        return r.headers['location']
    else:
        print 'failed to create entry status_code: %s text: %s entry: %s - cannot continue' % (r.status_code, r.text, entry)
        return None

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
    headers = post_headers(USER_TOKEN)
    teams_url = urljoin(PERMISSIONS_BASE, '/az-teams')
    r = requests.post(teams_url, headers=headers, json=team)
    if r.status_code == 201:
        GLOBAL_GOVS = r.headers['location']
        print 'correctly created "global governors" team %s etag: %s' % (GLOBAL_GOVS, r.headers['Etag'])
    else:
        print 'failed to create global governors team %s %s %s - cannot continue' % (teams_url, r.status_code, r.text)
        sys.exit(1)

    headers = get_headers(USER_TOKEN)
    url = urljoin(PERMISSIONS_BASE, '/az-permissions?/')
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

    # Create the "etc" directory. This directory will be an immediate child of the directory tree root - it can be found at /name-resource?/etc
    permissions = {
        '_inheritsPermissionsOf': '/'
        }
    etc_directory_url, etc_directory_etag = create_directory(permissions)
    if not etc_directory_url:
        print 'failed to create "etc" directory'
        sys.exit(1)

    # put the new directory in the directory '/' at the name 'desired'
    etc_entry = create_entry('/', 'etc', etc_directory_url)
    if not etc_entry:
        print "failed to create 'desired' entry in '/'"
        sys.exit(1)

    create_entry(etc_directory_url, 'sys-govs', GLOBAL_GOVS)

if __name__ == '__main__':
    main()
