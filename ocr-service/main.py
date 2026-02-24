from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import easyocr
from PIL import Image, ImageEnhance
import cv2
import numpy as np
import io

app = FastAPI()

# Initialize EasyOCR reader once at startup
reader = easyocr.Reader(['en'], gpu=False)

def preprocess_image(image: Image.Image) -> np.ndarray:
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Resize if too large
    max_width = 2000
    if image.width > max_width:
        ratio = max_width / image.width
        new_height = int(image.height * ratio)
        image = image.resize(
            (max_width, new_height),
            Image.LANCZOS
        )
    
    # Enhance contrast
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.8)
    
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
        contents = await file.read()
        if not contents:
            return JSONResponse(
                status_code=400,
                content={ 
                    'success': False, 
                    'error': 'Empty file' 
                }
            )

        image = Image.open(io.BytesIO(contents))
        processed = preprocess_image(image)

        # EasyOCR returns list of (bbox, text, confidence)
        results = reader.readtext(processed)

        extracted = []
        for (bbox, text, confidence) in results:
            if confidence > 0.3:
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


