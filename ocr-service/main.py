from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import easyocr
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import io
import cv2

app = FastAPI()

# Initialize EasyOCR reader once at startup
# gpu=False for CPU only, set True if you have GPU
reader = easyocr.Reader(['en'], gpu=False)

def preprocess_image(image: Image.Image) -> np.ndarray:
    # Convert to RGB
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Resize if too large — EasyOCR doesn't need 3x scale
    max_width = 2000
    if image.width > max_width:
        ratio = max_width / image.width
        new_height = int(image.height * ratio)
        image = image.resize(
            (max_width, new_height), 
            Image.LANCZOS
        )
    
    # Contrast enhancement only — skip slow denoising
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.8)
    
    # Convert to numpy for OpenCV
    img_np = np.array(image)
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    
    # Simple fast threshold instead of slow Otsu
    _, binary = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
    
    # Back to RGB
    rgb = cv2.cvtColor(binary, cv2.COLOR_GRAY2RGB)
    return rgb

@app.get('/health')
def health():
    return { 'status': 'ok' }

@app.post('/ocr')
async def extract_text(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if not contents:
            return JSONResponse(
                status_code=400,
                content={ 'success': False, 'error': 'Empty file' }
            )

        image = Image.open(io.BytesIO(contents))
        
        # Preprocess for better OCR
        processed = preprocess_image(image)
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


@app.get('/test')
def test():
    return {
        'status': 'ok',
        'reader_ready': reader is not None,
        'languages': ['en']
    }


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8001)


