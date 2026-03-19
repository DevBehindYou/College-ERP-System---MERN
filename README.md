# 🎓 College ERP Management System

A high-performance, minimalistic, and mobile-optimized Enterprise Resource Planning (ERP) solution. This system is designed for modern educational institutions to streamline campus operations through a clean and efficient interface.

## 🚀 Key Highlights

* **Minimalistic Design:** A clutter-free UI focused on usability and core administrative tasks.
* **Engineered for Speed:** Powered by **Vite** and optimized database indexing for near-instant load times.
* **Scalable Load Management:** Architecture designed to handle high traffic and large data volumes during peak academic periods.
* **Mobile Optimized:** Fully responsive experience across desktops, tablets, and smartphones.

## 🔐 Multi-Role Access Control

This system provides secure, customized portals for three distinct user types:

* **Admin Portal:** Full oversight of user management, course creation, teacher assignments, and fee structures.
* **Teacher Portal:** Tools for attendance tracking, assignment distribution, and grade management.
* **Student Portal:** Personal dashboards to view grades, track fee status, and access campus notices.

## 🛠️ Tech Stack

* **Frontend:** React.js + Vite (for lightning-fast development and builds)
* **Backend:** Node.js + Express.js
* **Databases:**
    * **MySQL:** Structured relational data for enrollments and financials.
    * **MongoDB:** Flexible document storage for notices and assignments.
* **Authentication:** JWT-based Role-Based Access Control (RBAC).

## 📂 Project Structure

```text
.
├── client/                # Frontend - React + Vite
│   ├── src/
│   │   ├── auth/          # Authentication Context & Route Guards
│   │   ├── components/    # Reusable UI components
│   │   ├── layouts/       # Dashboard & Admin shared layouts
│   │   ├── pages/         # Role-specific Views (Admin, Student, Teacher)
│   │   └── utils/         # Axios/API configuration
│   └── vite.config.js     # Build tool configuration
│
└── server/                # Backend - Node.js + Express
    ├── sql/               # MySQL database seeding scripts
    ├── src/
    │   ├── db/            # Connection logic for MongoDB & MySQL
    │   ├── middleware/    # Auth & Role-based Access Control
    │   ├── models/        # Database Schemas (Mongoose & SQL)
    │   ├── routes/        # API Endpoints segmented by user role
    │   └── utils/         # Helper functions and Async handlers
```
⚙️ Installation
Prerequisites
Node.js (v18+)

MySQL Server

MongoDB Instance

1. Clone the Project
Bash
```text
git clone [https://github.com/your-username/erp-portal.git](https://github.com/your-username/erp-portal.git)
cd erp-portal
```
3. Backend Setup
Bash
```text
cd server
npm install
# Configure your .env file with DB credentials
npm start
```
3. Frontend Setup
Bash
```text
cd client
npm install
npm run dev
```
🎥 Demo
[[College-ERP-System---MERN](https://github.com/DevBehindYou/College-ERP-System---MERN)]

📄 License

This project is licensed under the MIT License.

---
```text
### Why this works for your GitHub
* **Visual Hierarchy:** It uses clear headers and sub-headers to make the technical details easy to scan.
* **Hybrid Database Mention:** I specifically highlighted the use of both **MySQL** and **MongoDB**, as this demonstrates a high level of database architectural knowledge.
* **Project Tree:** The file structure I included is based directly on the `tree` output you provided, ensuring it is 100% accurate to your local environment.

Would you like me to draft a specific "Environment Variables" guide for the `.env` sect
```
