# import jwt
# import bcrypt
from jose import jwt, JWTError
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = os.getenv("JWT_ALGORITHM")



pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str):
    # DEBUG
    # print("HASH FUNCTION CALLED")
    # print("VALUE:", password)
    # print("TYPE:", type(password))
    # print("LENGTH:", len(password))
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str):
    return pwd_context.verify(plain, hashed)



def create_access_token(data: dict):
    to_encode = data.copy()
    # 유효기간 24시간
    expire = datetime.utcnow() + timedelta(hours=24)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
    


    # def get_password_hash(password: str):
    # password = password[:72]   # safety
    # return pwd_context.hash(password)