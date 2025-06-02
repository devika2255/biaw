const { createMainRecord, createReferenceRecords } = require('../models/airtableModel');
const sendEmail = require('../utils/emailService');
const { base2 } = require('../config/airtable');
const AIRTABLE_TABLE_NAMES = process.env.AIRTABLE_TABLE_NAMES || 'YourTableName';

exports.submitData = async (req, res) => {
  try {
    const formData = req.body;

    if (!formData["Builder-First-Name"] || !formData["Builder-Last-Name"] || !formData["Builder-Business-Name"]) {
      return res.status(400).json({ message: "First Name, Last Name, and Email (Business Name) are required." });
    }

    // Check if member ID already exists in Airtable
    if (formData["msMemId"]) {
      const existingRecords = await base2(AIRTABLE_TABLE_NAMES)
        .select({
          filterByFormula: `AND({Member ID} = '${formData["msMemId"]}', {Status} != 'Submitted')`,
          maxRecords: 1,
        })
        .firstPage();

      if (existingRecords.length > 0) {
        return res.status(400).json({ 
          message: "A record with this Member ID already exists in the system and is not in Submitted status.",
          existingRecordId: existingRecords[0].id
        });
      }
    }

    // Preserve all original fields
    const mainRecord = {
      "First Name": formData["Builder-First-Name"],
      "Last Name": formData["Builder-Last-Name"],
      "Phone": formData["Builder-Phone"],
      "Email": formData["Builder-Email-Address"], 
      "Title or Position": formData["Builder-Title-Position"],
      "Full Business Name":formData["Builder-Business-Name"],
      "Mailing Address": formData["Builder-Mailing"],
      "City": formData["Builder-City"],
      "State": formData["Builder-State"],
      "Zip": formData["Builder-Zip"],
      "Fed Tax Employer ID #": formData["Fed-Tax-Employer-ID"],
      "State Tax ID #": formData["State-Tax-ID"],
      "Corporate ID #": formData["Corporate-ID"],
      "Have you completed an education degree, professional designation program (NAHB or other) or apprenticeship?":
        formData["Education-Degree"],
      "Number of years in the construction business": formData["Construction-Business"],
      "Number of dwellings built in the last 5 years": formData["Dwellings-Built"],
      "Insurance Company": formData["Insurance-Company"],
      "Insurance Bond Holder": formData["Insurance-Bond-Holder"],
      "L&I Account ID#": formData["L-I-Account-ID"],
      "Member ID": formData["msMemId"] || null, 
    };

    // Insert into Airtable
    const createdMainRecord = await createMainRecord(mainRecord);
    console.log("Main record added:", createdMainRecord.id);

    // Handling reference contacts
    let referenceRecords = [];
    for (let i = 1; i <= 10; i++) {
      const refEmail = formData[`Reference-Email-Address-${i}`];
      const refFirstName = formData[`Reference-First-Name-${i}`];
      const refLastName = formData[`Reference-Last-Name-${i}`];
      const refPhone = formData[`Reference-Phone-${i}`];
      const refType = formData[`Reference-Type-${i}`];

      if (!refEmail || !refFirstName || !refLastName || !refPhone || !refType) {
        continue;
      }

      referenceRecords.push({
        fields: {
          "Email": refEmail,
          "First Name": refFirstName,
          "Last Name": refLastName,
          "Phone": refPhone,
          "Reference Type": refType,
          "Builder application Form 2": [createdMainRecord.id], 
        },
      });
    }

    // Insert references if available
    if (referenceRecords.length > 0) {
      await createReferenceRecords(referenceRecords);
      console.log("Reference records added:", referenceRecords.length);
    }

    // Send email notification after successful submission
    const emailSubject = 'Builder Application Received - BIAW';
    const emailBody = `Dear ${mainRecord["First Name"]} ${mainRecord["Last Name"]},

Thank you for submitting your Builder Application to BIAW. We have received your application and it is now under review.

Application Details:
- Business Name: ${mainRecord["Full Business Name"]}

What to Expect:
1. Our team will review your application and supporting documents
2. The review process typically takes 5-7 business days
3. You will receive an email notification once the review is complete

If you have any questions or need to provide additional information, please don't hesitate to contact us.

Best regards,
BIAW Support Team`;

    await sendEmail(mainRecord["Email"], emailSubject, emailBody);

    // Send success response
    res.status(200).json({
      message: "Data successfully added to Airtable, and email sent.",
      mainRecordId: createdMainRecord.id,
      referenceRecordsCount: referenceRecords.length,
    });

  } catch (error) {
    console.error("Error inserting data:", error);
    res.status(500).json({ message: "Failed to add data to Airtable.", error: error.message });
  }
};
