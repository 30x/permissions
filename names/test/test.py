import httplib, urllib, json
from os import environ as env
from urlparse import urlsplit
import base64

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

AUTHORITY = env['AUTHORITY']
GOVERNOR_ID = env.get('USER4_ID')
GOVERNOR_SECRET = env.get('USER4_SECRET')
GOVERNOR_GRANT_TYPE = env.get('USER4_GRANT_TYPE')
AUTH_URL = env.get('AUTH_URL')
AUTH_BASIC_CREDENTIALS = base64.b64encode('desiredcli:desiredclisecret')

#
# check if the given httplib.response object is from a
# successful request.  if so, just return True.
# otherwise, print some diagnostic info, and return False.
#
def check_response(response):
    if response.status // 100 == 2:
        return True
    print 'error: response.status=%s' % response.status
    pprint(vars(response))
    return False

TOKENS = {}

def get_valid_token(token_name, auth_url, id, secret, grant_type):
    """Return a valid token, which may require refreshing the token that is currently stored.

    Args:
        token_name (str): The name of the token. Used as a key to locate the previously created token
        auth_url (url):   The URL provided by the IDP that will authenticate the credentials and issue a token
        id (str):         The unsername or client_id of the credentials
        secret (str):     The password or cline tsecret of the credentials
        grant_type(str):  The OAuth grant_type ('password' or 'client_credentials')

    Returns:
        str:              A valid OAuth token that will not expire in the next 5 seconds
    """
    token_info = TOKENS.get(token_name)
    # If we have a stored token, and it doesn't expire in the next 5 seconds, use it, otherwise get a new one.
    if not token_info or int(time.time()) + 5 > token_info[1]:
        if token_info: print token_info[1]
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
            }
        url_parts = urlsplit(auth_url)
        conn_class = httplib.HTTPSConnection if url_parts.scheme == 'https' else httplib.HTTPConnection
        conn = conn_class(url_parts.netloc)
        if grant_type == 'password':
            headers['authorization'] = 'Basic %s' % AUTH_BASIC_CREDENTIALS
            body = {'grant_type': 'password', 'username': id, 'password': secret}
        else:
            body = {'grant_type': 'client_credentials', 'client_id': id, 'client_secret': secret}
        conn.request('POST', url_parts.path, urllib.urlencode(body), headers)
        response = conn.getresponse()
        if not check_response(response):
            if grant_type == 'password':
                print 'error: get_valid_token: url=%s response.status=%s AUTH_BASIC_CREDENTIALS:%s id: %s password: %s grant_type:%s' % (url_parts.path, response.status, AUTH_BASIC_CREDENTIALS, id, secret, grant_type)
            else:
                print 'error: get_valid_token: url=%s response.status=%s client_id: %s client_secret: %s grant_type:%s' % (url_parts.path, response.status, id, secret, grant_type)
            raise RuntimeError('get_valid_token conn.request failed')
        js = json.load(response)
        token = js['access_token']
        token_info = TOKENS[token_name] = (token, json.loads(b64_decode(token.split('.')[1]))['exp'])
        print 'retrieved %s token for %s' % (grant_type, id)
    return token_info[0]

GOVERNOR_TOKEN = get_valid_token('GOVERNOR', AUTH_URL, GOVERNOR_ID, GOVERNOR_SECRET, GOVERNOR_GRANT_TYPE)
GOVERNOR_CLAIMS = json.loads(b64_decode(GOVERNOR_TOKEN.split('.')[1]))      
GOVERNOR = '%s#%s' % (GOVERNOR_CLAIMS['iss'], GOVERNOR_CLAIMS['sub'])

def main():
    
    # create a new directory
    dir = {
        'kind': 'Directory',
        '_permissions': {
            '_inheritsPermissionsOf': '/',
            'name-entries': {
                'read': [GOVERNOR],
                'create': [GOVERNOR],
                'remove': [GOVERNOR],
                }
            }
    }
    headers = {'Content-type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer %s' % GOVERNOR_TOKEN}
    conn = httplib.HTTPConnection(AUTHORITY)
    conn.request('POST', '/dir-directories', json.dumps(dir), headers)
    response = conn.getresponse()
    data = response.read()
    if response.status == 201:
        directory = response.getheader('Location')
        print 'correctly created directory at %s' % directory
    else:
        print 'failed to create directory. status: %s data: %s' % (response.status, data)
        conn.close()
        return

    # insert our new directory at the root with the name 'SystemResources'
    entry = {
        'kind': 'Entry',
        'name': 'SystemResources',
        'directory': '/',
        'resource': directory
    }
    headers = {'Content-type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer %s' % GOVERNOR_TOKEN}
    conn = httplib.HTTPConnection(AUTHORITY)
    conn.request('POST', '/name-entries', json.dumps(entry), headers)
    response = conn.getresponse()
    data = response.read()
    if response.status == 201:
        print 'correctly created entry at %s' % response.getheader('Location')
    else:
        print 'failed to create entry. status: %s body: %s' % (response.status, data)
        conn.close()
        return

    # Put google.com in SystemResources
    entry = {
        'kind': 'Entry',
        'name': 'Google',
        'directory': directory,
        'resource': 'https://www.google.com/'
    }
    headers = {'Content-type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer %s' % GOVERNOR_TOKEN}
    conn = httplib.HTTPConnection(AUTHORITY)
    conn.request('POST', '/name-entries', json.dumps(entry), headers)
    response = conn.getresponse()
    data = response.read()
    if response.status == 201:
        print 'correctly created entry at %s' % response.getheader('Location')
    else:
        print 'failed to create entry. status: %s body: %s' % (response.status, data)
        conn.close()
        return

    # Lookup Google
    headers = {'Content-type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer %s' % GOVERNOR_TOKEN}
    conn = httplib.HTTPConnection(AUTHORITY)
    url = '/name-entry?/SystemResources/Google'
    conn.request('GET', url, headers=headers)
    response = conn.getresponse()
    if response.status == 200:
        data = json.load(response)
        print 'correctly found entry at %s name: %s resource: %s' % (response.getheader('Content-Location'), data['name'], data['resource'])
    else:
        data = response.read()
        print 'failed to find entry. url: %s status: %s body: %s' % (response.status, url, data)
        conn.close()
        return
    
    conn.close()

main()