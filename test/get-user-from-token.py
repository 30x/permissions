import base64, sys, json

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

def main(token):
    user_claims = json.loads(b64_decode(token.split('.')[1]))      
    user = '%s#%s' % (user_claims['iss'], user_claims['sub'])
    return user

if __name__ == '__main__':
    print main(sys.argv[1])