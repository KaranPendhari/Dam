import sys, os, json, re
import google.generativeai as genai
from tempfile import TemporaryDirectory

try:
    from openocr import OpenOCR
except ImportError:
    print("---JSON-START---")
    sys.stdout.write(json.dumps([{"error": "The 'openocr' library is not installed."}]))
    print("\n---JSON-END---")
    sys.exit(0)

# Add PDF support imports
try:
    from pdf2image import convert_from_path
except ImportError:
    convert_from_path = None  # PDF processing will be unavailable if not installed

# --- CONFIG ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("---JSON-START---")
    sys.stdout.write(json.dumps([{"error": "GEMINI_API_KEY environment variable not set"}]))
    print("\n---JSON-END---")
    sys.exit(0)


# ======================== EXISTING FUNCTIONS =========================

def perform_ocr(image_path):
    """Perform OCR on the given image and return structured results."""
    try:
        engine = OpenOCR()
        result, _ = engine(image_path)
        
        if not result:
            return {"error": f"No OCR results returned for {image_path}"}
        
        parts = result[0].split('\t', 1)
        if len(parts) < 2:
            return {"error": f"Unexpected OCR format for {image_path}"}
        
        return json.loads(parts[1])
    except Exception as e:
        return {"error": f"OCR failed: {str(e)}"}


def extract_info_with_gemini(ocr_results):
    """Extract structured information using Gemini API."""
    # Handle error case
    if isinstance(ocr_results, dict) and "error" in ocr_results:
        return ocr_results
    
    # Extract text from OCR results
    text = " ".join([item.get('transcription', '') for item in ocr_results])
    
    if not text.strip():
        return {"error": "No text found in OCR results."}
    
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('models/gemini-2.5-flash') 

        prompt = f"""
From the following text extracted from an ID card or document, extract these fields:
- name: The person's full name
- dob: Date of birth in DD/MM/YYYY format
- gender: Male/Female/Other
- card_number: Any ID or card number present

Return ONLY a valid JSON object with these exact keys: "name", "dob", "gender", "card_number".
If a field is not found, set its value to null.
Do not include any markdown formatting or code blocks in your response.

Text:
{text}
"""
        
        response = model.generate_content(prompt)
        json_text = response.text.strip()
        
        # Clean markdown formatting if present
        if json_text.startswith("```json"):
            json_text = json_text[7:]
        elif json_text.startswith("```"):
            json_text = json_text[3:]
        
        if json_text.endswith("```"):
            json_text = json_text[:-3]
        
        json_text = json_text.strip()
        
        # Parse and validate
        extracted = json.loads(json_text)
        
        # Ensure all expected keys exist
        result = {
            "name": extracted.get("name"),
            "dob": extracted.get("dob"),
            "gender": extracted.get("gender"),
            "card_number": extracted.get("card_number")
        }
        
        return result
        
    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse Gemini response as JSON: {str(e)}", "raw_response": response.text[:200]}
    except Exception as e:
        return {"error": f"Gemini API call failed: {str(e)}"}


# ======================== ENHANCEMENT: PDF SUPPORT =========================

def process_pdf(pdf_path):
    """Convert PDF to images, run OCR+Gemini on each page, and merge results."""
    if convert_from_path is None:
        return {"file": os.path.basename(pdf_path), "error": "pdf2image not installed. Run 'pip install pdf2image pillow'."}

    if not os.path.exists(pdf_path):
        return {"file": os.path.basename(pdf_path), "error": "PDF file not found"}

    try:
        with TemporaryDirectory() as temp_dir:
            pages = convert_from_path(pdf_path, 300)
            for i, page in enumerate(pages, start=1):
                img_path = os.path.join(temp_dir, f"page_{i}.png")
                page.save(img_path, "PNG")

                ocr_results = perform_ocr(img_path)
                extracted_data = extract_info_with_gemini(ocr_results)
                
                # If a name is found, use this result and stop processing further pages.
                if extracted_data.get("name"):
                    return {"file": os.path.basename(pdf_path), **extracted_data}
            
            # If no name was found on any page, return a result without a name.
            return {"file": os.path.basename(pdf_path), "name": None}

    except Exception as e:
        return {"file": os.path.basename(pdf_path), "error": f"PDF processing failed: {str(e)}"}


# ======================== EXISTING FILE HANDLER =========================

def process_file(path):
    """Process a single file: OCR + NER (supports both image and PDF)."""
    if not os.path.exists(path):
        return {"file": os.path.basename(path), "error": "File not found"}

    # --- NEW: Handle PDFs automatically ---
    if path.lower().endswith(".pdf"):
        return process_pdf(path)

    # --- Otherwise, treat as image ---
    ocr_results = perform_ocr(path)
    if isinstance(ocr_results, dict) and "error" in ocr_results:
        return {"file": os.path.basename(path), **ocr_results}
    
    extracted_data = extract_info_with_gemini(ocr_results)
    return {"file": os.path.basename(path), **extracted_data}


# ======================== MAIN SCRIPT =========================

if __name__ == "__main__":
    try:
        if len(sys.argv) < 2:
            print("---JSON-START---")
            sys.stdout.write(json.dumps([{"error": "Usage: python ner.py <file_path>"}]))
            print("\n---JSON-END---")
            sys.exit(0)
        
        file_path = sys.argv[1]
        result = process_file(file_path)
        
        # Output with clear delimiters
        print("---JSON-START---")
        sys.stdout.write(json.dumps([result]))
        print("\n---JSON-END---")
        sys.stdout.flush()
        
    except Exception as e:
        print("---JSON-START---")
        sys.stdout.write(json.dumps([{"error": str(e)}]))
        print("\n---JSON-END---")
        sys.stdout.flush()
