import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
print(f"Key: {api_key[:10]}...")
genai.configure(api_key=api_key)

model = genai.GenerativeModel('gemini-1.5-flash')
try:
    response = model.generate_content("Say hi")
    print(response.text)
except Exception as e:
    print(f"Error: {e}")
