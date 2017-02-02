import requests
import base64
import json
from os import environ as env
from urlparse import urljoin

EXTERNAL_SCHEME = env['EXTERNAL_SCHEME']
BASE_URL = '%s://%s:%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'], env['EXTERNAL_SY_ROUTER_PORT']) if 'EXTERNAL_SY_ROUTER_PORT' in env else '%s://%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'])

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
print USER1_CLAIMS
USER1 = '%s#%s' % (USER1_CLAIMS['iss'], USER1_CLAIMS['sub'])
USER1_E = USER1.replace('#', '%23')
print USER1_E

if 'APIGEE_TOKEN1' in env:
    TOKEN2 = env['APIGEE_TOKEN1']
else:
    with open('token.txt') as f:
        TOKEN2 = f.read()
USER2_CLAIMS = json.loads(b64_decode(TOKEN2.split('.')[1]))      
USER2 = '%s#%s' % (USER2_CLAIMS['iss'], USER2_CLAIMS['sub'])
USER2_E = USER2.replace('#', '%23')

def main():
    print USER1
    folder1 = {
        'isA': 'Folder',
        '_permissions': {
            '_self': {
                'govern': [USER1_E],
                'admin': [USER1_E],
                'read': [USER1_E],
                'update': [USER1_E],
                'delete': [USER1_E]
                }
            },
        'test-data': True     
        }
    folders_url = 'http://localhost:8080/folders' 
    headers = {'Accept': 'application/json'}
    r = requests.post(folders_url, headers=headers, json=folder1)
    if r.status_code == 401:
        print 'correctly rejected folder create creation without user' 
    else:
        print 'incorrectly rejected folder creation with wrong code (401 expected) %s %s' % (r.status_code, r.text)

    # Create folder
    
    headers['Authorization'] = 'BEARER %s' % TOKEN1
    r = requests.post(folders_url, headers=headers, json=folder1)
    if r.status_code == 201:
        folder1_rel_url = r.headers['Location']
        folder1_url = urljoin(BASE_URL, folder1_rel_url)
        print 'correctly created folder at URL: %s' % folder1_rel_url
    else:
        print 'failed to create folder %s %s' % (r.status_code, r.text)
        return
    
    # Retrieve permissions for Acme org

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get('http://localhost:8080/permissions?%s' %folder1_rel_url, headers=headers)
    if r.status_code == 200:
        server_folder1_permissions = r.json()
        if ('Etag' in r.headers):
            folder1_permissions_if_match = r.headers['Etag']
            print 'correctly retrieved folder permissions'
        else:
            print 'failed to find etag in get response'
            return
    else:
        print 'failed to get folder %s %s' % (r.status_code, r.text)
        return
    
    # Retrieve permissions for Acme org

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(folder1_url, headers=headers)
    if r.status_code == 200:
        server_folder1 = r.json()
        if ('Etag' in r.headers):
            folder1_if_match = r.headers['Etag']
            print 'correctly retrieved folder '
        else:
            print 'failed to find etag in get response'
    else:
        print 'failed to get folder %s %s' % (r.status_code, r.text)
    
    # Retrieve permissions for Acme org

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.delete(folder1_url, headers=headers)
    if r.status_code == 200:
        server_folder1 = r.json()
        if ('Etag' in r.headers):
            folder1_if_match = r.headers['Etag']
            print 'correctly deleted folder '
        else:
            print 'failed to find etag in delete response'
    else:
        print 'failed to delete folder %s %s' % (r.status_code, r.text)

    # Retrieve permissions for Acme org

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get('http://localhost:8080/permissions?%s' %folder1_rel_url, headers=headers)
    if r.status_code == 404:
        print 'correctly saw that permissions are deleted for deleted folder (404)'
    else:
        print 'failed - expected 404 error for deleted folder permissions %s %s' % (r.status_code, r.text)
    
if __name__ == '__main__':
    main()