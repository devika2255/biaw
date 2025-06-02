const sendEmail = require('../utils/emailService');
const { base2 } = require('../config/airtable');
const axios = require('axios');
const AIRTABLE_TABLE_NAMES = process.env.AIRTABLE_TABLE_NAMES || 'YourTableName';

if (!process.env.WEBFLOW_API_KEY || !process.env.WEBFLOW_COLLECTION_ID) {
  throw new Error('WEBFLOW_API_KEY and WEBFLOW_COLLECTION_ID must be set in environment variables');
}

// Valid certification statuses
const VALID_STATUSES = ['Submitted', 'Under Process', 'Certified', 'Rejected'];

// Email templates for different statuses
const EMAIL_TEMPLATES = {
  'Certified': {
    subject: 'Congratulations! Your Builder Application is Certified',
    template: (firstName, lastName) => `Dear ${firstName} ${lastName},

Congratulations! We are delighted to inform you that your Builder Application has been approved, and you are now officially Certified.

Your certification demonstrates your commitment to excellence in the building industry. As a certified builder, you now have access to all the benefits and resources available to our certified members.

Key Benefits:
- Access to exclusive industry resources
- Recognition in our certified builders directory
- Priority support for industry-related queries
- Networking opportunities with other certified professionals

If you have any questions or need assistance with your certification, please don't hesitate to contact us.

Best regards,
BIAW Support Team`
  },
  'Rejected': {
    subject: 'Builder Application Status Update',
    template: (firstName, lastName) => `Dear ${firstName} ${lastName},

We regret to inform you that your Builder Application has not been approved at this time.

We understand this may be disappointing news. Our review process is thorough and considers various factors to ensure the highest standards in our industry.

Next Steps:
1. Review the application requirements
2. Address any areas that may need improvement
3. Consider reapplying in the future

If you would like to discuss the decision or receive feedback on your application, please contact us. We're here to help you understand the requirements better and guide you through the process.

Best regards,
BIAW Support Team`
  },
  'Under Process': {
    subject: 'Your Builder Application is Under Review',
    template: (firstName, lastName) => `Dear ${firstName} ${lastName},

We are writing to inform you that your Builder Application is currently under review by our team.

What to Expect:
- Our review process typically takes 5-7 business days
- We are carefully evaluating all aspects of your application
- You will receive another email once the review is complete

During this time, if you have any questions or need to provide additional information, please don't hesitate to contact us.

Best regards,
BIAW Support Team`
  }
};

// Send status email
const sendStatusEmail = async (fields) => {
  try {
    const firstName = fields['First Name'] || '';
    const lastName = fields['Last Name'] || '';
    const email = fields['Email'];
    const status = fields["Status"]?.name;

    if (!email) {
      throw new Error('Email address is required to send status email');
    }

    if (!status || !EMAIL_TEMPLATES[status]) {
      throw new Error(`Invalid or unsupported status: ${status}`);
    }

    const template = EMAIL_TEMPLATES[status];
    const emailSubject = template.subject;
    const emailText = template.template(firstName, lastName);

    await sendEmail(email, emailSubject, emailText);
    console.log(`Status email (${status}) sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending status email:', error);
    throw error;
  }
};

// Update certification status in Webflow
const updateWebflowStatus = async (fields) => {
  try {
    const status = fields["Status"]?.name;
    
    if (!status || !VALID_STATUSES.includes(status)) {
      throw new Error("Valid Status is required (Submitted, Under Process, Certified, or Rejected)");
    }

    // First, find the Webflow item by member-id
    const webflowItems = await axios.get(
      `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items`,
      {
        headers: {
          Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Find the matching item by member-id
    const matchingItem = webflowItems.data.items.find(
      item => item.fieldData["member-id"] === fields["Member ID"]
    );

    if (!matchingItem) {
      throw new Error("No Webflow item found with matching Member ID");
    }

    // Check if current status is already Rejected or Certified
    const currentStatus = matchingItem.fieldData["certification-status"];
    if (currentStatus === "Rejected" || currentStatus === "Certified") {
      console.log(`Status update skipped - certification is already ${currentStatus}`);
      return {
        webflowItemId: matchingItem.id,
        oldStatus: currentStatus,
        newStatus: currentStatus,
        skipped: true,
        reason: `Already ${currentStatus}`
      };
    }

    // Update the certification status in Webflow
    const updateResponse = await axios.patch(
      `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items/${matchingItem.id}/live`,
      {
        fieldData: {
          "certification-status": status
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Successfully updated Webflow item certification status:', {
      memberId: fields["Member ID"],
      webflowItemId: matchingItem.id,
      oldStatus: matchingItem.fieldData["certification-status"],
      newStatus: status
    });

    return {
      webflowItemId: matchingItem.id,
      oldStatus: matchingItem.fieldData["certification-status"],
      newStatus: status,
      skipped: false
    };
  } catch (error) {
    console.error('Error updating Webflow item:', error.response?.data || error.message);
    throw error;
  }
};

// Handle mail status update
const handleMailStatus = async (req, res) => {
  try {
    const { id, fields } = req.body;
    console.log('Received mail status update:', { id, fields });

    // Validate required fields
    if (!fields["Member ID"]) {
      return res.status(400).json({ 
        message: "Member ID is required" 
      });
    }

    // Get mail status and certification status
    const mailStatus = fields["Send Mail Status"]?.name;
    const certificationStatus = fields["Status"]?.name;

    if (!mailStatus) {
      return res.status(400).json({ 
        message: "Mail status is required" 
      });
    }

    if (!certificationStatus || !EMAIL_TEMPLATES[certificationStatus]) {
      return res.status(400).json({ 
        message: "Valid certification status is required" 
      });
    }

    // Send email if mail status is not "Hold mail"
    if (mailStatus !== 'Hold mail') {
      try {
        // First check webflow status
        const webflowResult = await updateWebflowStatus(fields);
        
        // Only send email if webflow status wasn't skipped
        if (!webflowResult.skipped) {
          const emailSent = await sendStatusEmail(fields);

          // Only update Airtable if email was sent successfully
          if (emailSent && id) {
            await base2(AIRTABLE_TABLE_NAMES).update(id, {
              'Send Mail Status': 'Mailed'
            });
            console.log(`Airtable record ${id} updated: Send Mail Status set to 'Mailed'`);
          }
        }

        res.status(200).json({ 
          message: webflowResult.skipped ? 
            `Status update skipped - ${webflowResult.reason}` : 
            "Status email sent and webflow updated successfully",
          emailSent: !webflowResult.skipped,
          status: certificationStatus,
          webflowUpdate: webflowResult
        });
      } catch (error) {
        console.error('Error in status update:', error);
        res.status(500).json({ 
          message: "Failed to process status update",
          error: error.message
        });
      }
    } else {
      res.status(200).json({ 
        message: "No email sent - mail is on hold",
        emailSent: false,
        reason: 'Mail is on hold'
      });
    }

  } catch (error) {
    console.error('Error handling mail status:', error);
    res.status(500).json({ 
      message: "Failed to process mail status",
      error: error.message
    });
  }
};

module.exports = {
  handleMailStatus,
  sendStatusEmail
}; 