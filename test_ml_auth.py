import asyncio
from dotenv import load_dotenv
import os

load_dotenv("backend/.env")

from backend.api.mercadolibre import ml_client

async def main():
    tok = await ml_client._get_token()
    print('TOKEN:', tok)
    res = await ml_client.search('auriculares', limit=2)
    print('RES:', res)

asyncio.run(main())
