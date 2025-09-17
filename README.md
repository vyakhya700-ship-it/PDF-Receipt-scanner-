
## **Project Overview**


Develop a solution as a **web application** with **REST APIs** that can:
1. **Upload scanned receipts** in PDF format. The files can be stored in a local directory.
2. **Validate** the uploaded files to ensure they are valid PDFs.
3. **Extract key details** from the receipts using **OCR/AI-based text extraction** techniques.
4. **Store extracted information** in a structured database schema.
5. **Provide APIs** for managing and retrieving receipts and their extracted data.

---

## **Database Schema**

The extracted information should be stored in an **SQLite database (`receipts.db`)**.

### **1. Receipt File Table (`receipt_file`)**
Stores metadata of uploaded receipt files.

| Column Name     | Description                                                    |
|-----------------|----------------------------------------------------------------|
| `id`            | Unique identifier for each uploaded file                        |
| `file_name`     | Name of the uploaded file                                       |
| `file_path`     | Storage path of the uploaded file                               |
| `file_hash`     | SHA-256 hash of file content for duplicate detection            |
| `is_valid`      | Indicates if the file is a valid PDF                            |
| `invalid_reason`| Reason for file being invalid (if applicable)                   |
| `is_processed`  | Indicates if the file has been processed                        |
| `created_at`    | Creation time (when receipt was first uploaded)                 |
| `updated_at`    | Last update time (latest modification in case of re-upload)     |

### **2. Receipt Table (`receipt`)**
Stores extracted information from valid receipt files.

| Column Name     | Description                                     |
|----------------|-------------------------------------------------|
| `id`           | Unique identifier for each extracted receipt     |
| `purchased_at` | Date and time of purchase (extracted from receipt)|
| `merchant_name`| Merchant name (extracted from receipt)           |
| `total_amount` | Total amount spent (extracted from receipt)      |
| `file_path`    | Path to the associated scanned receipt          |
| `created_at`   | Creation time (when receipt was processed)       |
| `updated_at`   | Last update time (latest modification)          |
---

## **API Specifications**

The solution should expose a set of **REST APIs** for receipt management. You may use any web framework and implement the APIs with or without an ORM.

### **1. `/upload` (POST)**
- Uploads a receipt file (PDF format only).
- Stores metadata in the `receipt_file` table.
- **Duplicate Detection**: Uses SHA-256 hash to detect duplicate files

### **2. `/validate` (POST)**
- Validates whether the uploaded file is a valid PDF.
- Updates `is_valid` and `invalid_reason` fields in the `receipt_file` table.

### **3. `/process` (POST)**
- Extracts receipt details using enhanced OCR/AI parsing.
- Stores extracted information in the `receipt` table.
- Marks `is_processed` as `True` in the `receipt_file` table.
- **Enhanced Parsing**: Improved total amount detection with multiple patterns

### **4. `/receipts` (GET)**
- Lists all receipts stored in the database.

### **5. `/receipts/{id}` (GET)**
- Retrieves details of a specific receipt by its ID.


## Run Instructions (Express + SQLite)

1. Install dependencies
   - `npm install`

2. Start the server
   - Development: `npm run dev`
   - Production: `npm start`

3. API Endpoints
   - `POST /upload` multipart/form-data with field `file` (PDF only)
     - Response: `{ id, file_name, file_path }`
     - Validations:
       - Only PDFs allowed (MIME/extension check)
       - File is stored, SHA-256 hash computed for duplicate detection
       - Duplicate uploads update existing record and return `{ duplicate: true }`
   - `POST /upload/validate` form-urlencoded body: `id=<receipt_file_id>`
     - Response: `{ id, is_valid, invalid_reason }`
     - Validations:
       - 404 if file id not found
       - Marks invalid with reason if file missing on server or unreadable
   - `POST /upload/process` form-urlencoded body: `id=<receipt_file_id>`
     - Extracts text via enhanced PDF parsing with improved amount detection
     - Response: `{ receipt_id, merchant_name, total_amount, purchased_at }`
     - Validations:
       - 404 if file id not found
       - 400 if file not validated
   - `GET /receipts` → list receipts
   - `GET /receipts/:id` → single receipt

4. Data Storage
   - Database file: `receipts.db` in project root
   - Uploaded PDFs: `uploads/`

5. Database Management Commands
   - `npm run clear` - Clear all data from tables
   - `npm run drop` - Drop all tables (recreated on next server start)

6. Notes
   - Enhanced text extraction with multiple parsing patterns for better accuracy
   - SHA-256 hash-based duplicate detection prevents redundant uploads
   - Comprehensive error handling and validation throughout the pipeline

## API Documentation (Swagger)

- Browse interactive docs at `http://localhost:3000/api-docs`
- Server base for APIs in docs: `http://localhost:3000/api/v1`
- You can test endpoints directly from the Swagger UI:
  - Upload: select a PDF for `file`
  - Validate: set `id` returned from upload
  - Process: set `id` (validated first)
  - View: browse receipts and individual receipt details

## Enhanced Features

### **Duplicate Detection**
- Uses SHA-256 file hashing to prevent duplicate uploads
- Returns existing record info when duplicate detected
- Maintains data integrity and storage efficiency

### **Improved Parsing**
- Multiple regex patterns for total amount extraction
- Handles various receipt formats and layouts
- Prioritizes "Total" keyword matches for accuracy
- Fallback mechanisms for edge cases

### **Database Enhancements**
- Added `file_hash` column for duplicate detection
- Proper foreign key relationships
- Optimized indexing for better performance
- WAL mode enabled for concurrent access

## **Implementation Improvements & Additional Features**

### **Enhanced Database Schema**
Beyond the original requirements, we've added several columns to improve functionality:

#### **Additional Columns in `receipt_file` table:**
| Column Name     | Description                                                    |
|-----------------|----------------------------------------------------------------|
| `file_size`     | Size of uploaded file in bytes for storage management          |
| `mime_type`     | MIME type of uploaded file for validation                      |

#### **Additional Columns in `receipt` table:**
| Column Name        | Description                                                 |
|-------------------|-------------------------------------------------------------|
| `receipt_file_id` | Foreign key reference to `receipt_file.id` for data integrity |
| `raw_text`        | Complete extracted text from PDF for debugging/reprocessing  |
| `confidence_score`| AI parsing confidence score (0.0-1.0) for quality assessment |

### **Advanced Parsing Features**
1. **Multi-Pattern Amount Detection**: Uses 3+ regex patterns to catch various receipt formats
2. **Confidence Scoring**: Calculates parsing confidence based on extracted data completeness
3. **Raw Text Storage**: Preserves original extracted text for future improvements
4. **Debug Mode**: Environment variable `PARSER_DEBUG=1` enables detailed parsing logs

#### **Confidence Score Calculation**
The system calculates a confidence score (0.0-1.0) to indicate parsing quality:

| Component | Weight | Description |
|-----------|--------|-------------|
| Merchant Name | 0.3 | Successfully extracted merchant/store name |
| Total Amount | 0.4 | Successfully extracted total amount (most critical) |
| Purchase Date | 0.3 | Successfully extracted purchase date |

**Score Examples:**
- **1.0** = Perfect extraction (all data found)
- **0.7** = Good extraction (amount + one other field)
- **0.4** = Partial extraction (only amount found)
- **0.0** = Failed extraction (no data found)

**Usage:** Low confidence scores (<0.5) indicate receipts that may need manual review or improved parsing logic.

### **File Management Enhancements**
1. **File Size Tracking**: Monitors upload sizes for storage optimization
2. **MIME Type Validation**: Double-checks file types beyond extension validation
3. **Foreign Key Relationships**: Proper database relationships between files and receipts
4. **Duplicate Prevention**: Hash-based detection prevents storage waste

### **API Response Improvements**
- Added `confidence_score` in process response
- Enhanced error messages with specific failure reasons
- Duplicate detection returns existing record info
- Better validation error handling

### **Development Tools**
- Database management scripts (`npm run clear`, `npm run drop`)
- Debug logging for parsing troubleshooting
- Temporary file extraction for development analysis
- WAL mode for better concurrent access performance
