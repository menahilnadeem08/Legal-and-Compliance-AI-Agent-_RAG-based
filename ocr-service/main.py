from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import easyocr
from PIL import Image, ImageEnhance
import cv2
import numpy as np
import io
import os

app = FastAPI()

# Initialize EasyOCR reader once at startup
reader = easyocr.Reader(['en'], gpu=False)

# Configuration from environment variables
OCR_CONFIDENCE_THRESHOLD = float(os.getenv('OCR_CONFIDENCE_THRESHOLD', '0.3'))
IMAGE_MAX_WIDTH = int(os.getenv('IMAGE_MAX_WIDTH', '2000'))
CONTRAST_ENHANCE = float(os.getenv('CONTRAST_ENHANCE', '1.8'))
MAX_FILE_SIZE = int(os.getenv('OCR_MAX_FILE_SIZE', '20971520'))  # 20MB default
ALLOWED_MIME_TYPES = {'image/jpeg', 'image/png', 'image/tiff', 'image/webp'}

def preprocess_image(image: Image.Image) -> np.ndarray:
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Resize if too large
    max_width = IMAGE_MAX_WIDTH
    if image.width > max_width:
        ratio = max_width / image.width
        new_height = int(image.height * ratio)
        image = image.resize(
            (max_width, new_height),
            Image.LANCZOS
        )
    
    # Enhance contrast
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(CONTRAST_ENHANCE)
    
    # Convert to numpy
    img_np = np.array(image)
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    _, binary = cv2.threshold(
        gray, 150, 255, cv2.THRESH_BINARY
    )
    rgb = cv2.cvtColor(binary, cv2.COLOR_GRAY2RGB)
    return rgb

@app.get('/health')
def health():
    return { 'status': 'ok', 'engine': 'EasyOCR' }

@app.get('/test')
def test():
    return {
        'status': 'ok',
        'engine': 'EasyOCR',
        'gpu': False,
        'languages': ['en']
    }

@app.post('/ocr')
async def extract_text(file: UploadFile = File(...)):
    try:
        # Validate file type
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f'Invalid file type. Allowed: {list(ALLOWED_MIME_TYPES)}'
            )
        
        contents = await file.read()
        if not contents:
            return JSONResponse(
                status_code=400,
                content={ 
                    'success': False, 
                    'error': 'Empty file' 
                }
            )
        
        # Validate file size
        if len(contents) > MAX_FILE_SIZE:
            return JSONResponse(
                status_code=413,
                content={
                    'success': False,
                    'error': f'File too large. Max size: {MAX_FILE_SIZE / (1024*1024):.1f} MB'
                }
            )

        image = Image.open(io.BytesIO(contents))
        processed = preprocess_image(image)

        # EasyOCR returns list of (bbox, text, confidence)
        results = reader.readtext(processed)

        extracted = []
        for (bbox, text, confidence) in results:
            if confidence > OCR_CONFIDENCE_THRESHOLD:
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
        print(f'[OCR ERROR] {str(e)}')
        return JSONResponse(
            status_code=500,
            content={ 'success': False, 'error': str(e) }
        )

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8001)


