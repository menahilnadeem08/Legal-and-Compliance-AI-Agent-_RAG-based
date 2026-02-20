from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import easyocr
import numpy as np
from PIL import Image
import io

app = FastAPI()

# Initialize EasyOCR reader once at startup
# gpu=False for CPU only, set True if you have GPU
reader = easyocr.Reader(['en'], gpu=False)

@app.get('/health')
def health():
    return { 'status': 'ok' }

@app.post('/ocr')
async def extract_text(file: UploadFile = File(...)):
    try:
        # Read image bytes from uploaded file
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        image_np = np.array(image)

        # Run OCR
        results = reader.readtext(image_np)

        # Extract text with confidence scores
        extracted = []
        for (bbox, text, confidence) in results:
            if confidence > 0.3:  # filter low confidence
                extracted.append({
                    'text': text,
                    'confidence': round(confidence, 3)
                })

        full_text = ' '.join([e['text'] for e in extracted])

        return JSONResponse({
            'success': True,
            'text': full_text,
            'words': extracted,
            'word_count': len(extracted)
        })

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={ 'success': False, 'error': str(e) }
        )

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8001)


