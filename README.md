# IPCC Marks Entry Application

A full-stack web application designed for faculty members to efficiently manage, calculate, and export student marks.

## Features

*   **Faculty Authentication:** Secure login for faculty members.
*   **Personalized Dashboards:** Each faculty account has its own isolated workspace. A faculty member can only view, edit, and export the marks entries they have created.
*   **Seamless Data Import:**
    *   Initialize a gradebook by uploading an Excel `.xlsx` or `.csv` file containing student `USN` and `Name`.
*   **Automated Marks Calculation (FSD Scheme):**
    *   **Theory:** Enter IAT1, IAT2, and IAT3 out of **50**, Quiz out of **30**, and AAT out of **10**. The system calculates the reduced FSD columns and theory total.
    *   **Lab:** Enter raw Lab Exam marks out of **50**. The system reduces them to the FSD lab marks column out of **20**.
*   **Built-in Validation:** Real-time client and server-side validation ensures that no invalid marks (e.g., IAT marks > 50, Quiz > 30, AAT > 10) can be entered or saved.
*   **Persistent Storage:** Data is securely stored using a PostgreSQL relational database (Neon DB).
*   **Export Formats:** Generate and download comprehensive FSD-format reports in both Excel and CSV, including raw scores, reduced columns, scaled averages, and final totals. Attendance columns are left blank.

## Technology Stack

*   **Frontend:** HTML5, CSS3, Vanilla JavaScript
*   **Backend:** Node.js, Express.js
*   **Database:** PostgreSQL (Neon DB via `pg` library)
*   **File Processing:** `xlsx` for Excel, `json2csv` for CSV, `multer` for uploads

## Getting Started

### Prerequisites

*   Node.js (v14 or higher recommended)
*   A PostgreSQL database connection URI

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/chinmai-sd-123/fullstack_aat.git
    cd fullstack_aat
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Environment Variables:
    Create a `.env` file in the root directory and add your PostgreSQL database connection string:
    ```env
    DATABASE_URL=postgres://user:password@hostname:port/dbname?sslmode=require
    SESSION_SECRET=your_super_secret_session_key
    ```

4.  Start the Application:
    ```bash
    npm start
    ```

    The application will bind to `http://localhost:3000` (or `PORT` specified in your `.env`).

## Deployment

The application is configured to be easily deployed on modern cloud platforms like Render, Heroku, or Vercel using the `npm start` command. Ensure the `DATABASE_URL` is set in your host's environment variables.
