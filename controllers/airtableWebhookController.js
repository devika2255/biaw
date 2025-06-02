const axios = require('axios');

const handleAirtableWebhook = async (req, res) => {
    try {
        const airtableData = req.body;
        console.log('Received Airtable webhook data:', airtableData);
        
        // Extract relevant data from Airtable webhook
        const {
            id,
            fields: {
                'Related Board meeting': relatedBoardMeeting,
                'Agenda': agenda,
                'Minutes': minutes,
                'Status': statusObj,
                'Council': council,
                'Council Name': councilName,
                'Year': year
            }
        } = airtableData;

        let status = statusObj?.name || statusObj;
        if (status && status.toLowerCase().trim() === 'past') {
            status = 'Completed';
        }

        const slug = councilName?.[0]?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || '';

        try {
            // First get the board meetings from collection 3
            const boardMeetingsResponse = await axios.get(
                `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID3}/items`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Board meetings response:', JSON.stringify(boardMeetingsResponse.data, null, 2));

            const boardMeetings = boardMeetingsResponse.data.items || [];
            console.log('Board meetings array:', JSON.stringify(boardMeetings, null, 2));

            const matchingBoardMeeting = boardMeetings.find(item => {
                console.log('Checking item:', JSON.stringify(item, null, 2));
                return item.fieldData?.name === relatedBoardMeeting?.name;
            });

            if (!matchingBoardMeeting) {
                throw new Error(`Board meeting "${relatedBoardMeeting?.name}" not found in Webflow`);
            }

            console.log('Found matching board meeting:', JSON.stringify(matchingBoardMeeting, null, 2));

            const collectionSchemaResponse = await axios.get(
                `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID2}`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Collection schema:', JSON.stringify(collectionSchemaResponse.data, null, 2));

            const statusField = collectionSchemaResponse.data.fields.find(f => f.slug === 'status');
            const boardMeetingField = collectionSchemaResponse.data.fields.find(f => f.slug === 'board-meeting');
            const statusOption = statusField?.validations?.options?.find(opt => 
                opt.name.toLowerCase() === status.toLowerCase().trim()
            );
            const boardMeetingOption = boardMeetingField?.validations?.options?.find(opt => 
                opt.name === relatedBoardMeeting?.name
            );

            const webflowItemData = {
                status: statusOption?.id || '',
                'board-meeting': boardMeetingOption?.id || '',
                name: councilName?.[0] || '',
                slug: slug,
                year: year || '',
                'related-board-meeting': [matchingBoardMeeting.id]
            };

            if (agenda && agenda.length > 0) {
                const agendaFile = agenda[0];
                webflowItemData['agenda-2'] = {
                    url: agendaFile.url,
                    alt: null
                };
            }

            if (minutes && minutes.length > 0) {
                const minutesFile = minutes[0];
                webflowItemData['minutes-2'] = {
                    url: minutesFile.url,
                    alt: null
                };
            }

            console.log('Creating Webflow item with data:', JSON.stringify(webflowItemData, null, 2));

            // Create new Webflow item
            const webflowResponse = await axios.post(
                `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID2}/items/live`,
                {
                    fieldData: webflowItemData
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Webflow item created:', JSON.stringify(webflowResponse.data, null, 2));

            // After creating the item, update the Airtable record with the new Webflow ID
            await axios.patch(
                `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID3}/${process.env.AIRTABLE_TABLE_NAMES5}/${id}`,
                {
                    fields: {
                        'Webflow ID': webflowResponse.data.id
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEYS3}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            res.status(200).json({
                success: true,
                message: 'Webflow item created successfully',
                data: webflowResponse.data
            });

        } catch (webflowError) {
            console.error('Webflow API Error:', webflowError.response?.data || webflowError.message);
            throw webflowError;
        }

    } catch (error) {
        console.error('Error processing Airtable webhook:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing webhook',
            error: error.message,
            details: error.response?.data
        });
    }
};

const handleAirtableUpdateWebhook = async (req, res) => {
    try {
        const airtableData = req.body;
        console.log('Received Airtable update webhook data:', airtableData);

        const {
            id,
            fields: {
                'Webflow ID': webflowId,
                'Related Board meeting': relatedBoardMeeting,
                'Agenda': agenda,
                'Minutes': minutes,
                'Status': statusObj,
                'Council': council,
                'Council Name': councilName,
                'Year': year
            }
        } = airtableData;

        if (!webflowId) {
            return res.status(400).json({
                success: false,
                message: 'No Webflow ID found in Airtable record. Cannot update Webflow item.'
            });
        }

        let status = statusObj?.name || statusObj;
        if (status && status.toLowerCase().trim() === 'past') {
            status = 'Completed';
        }

        const slug = councilName?.[0]?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || '';

        const boardMeetingsResponse = await axios.get(
            `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID3}/items`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const boardMeetings = boardMeetingsResponse.data.items || [];
        const matchingBoardMeeting = boardMeetings.find(item => {
            return item.fieldData?.name === relatedBoardMeeting?.name;
        });

        if (!matchingBoardMeeting) {
            throw new Error(`Board meeting "${relatedBoardMeeting?.name}" not found in Webflow`);
        }

        const collectionSchemaResponse = await axios.get(
            `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID2}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const statusField = collectionSchemaResponse.data.fields.find(f => f.slug === 'status');
        const boardMeetingField = collectionSchemaResponse.data.fields.find(f => f.slug === 'board-meeting');
        const statusOption = statusField?.validations?.options?.find(opt => 
            opt.name.toLowerCase() === status.toLowerCase().trim()
        );

        const boardMeetingOption = boardMeetingField?.validations?.options?.find(opt => 
            opt.name === relatedBoardMeeting?.name
        );

        const webflowItemData = {
            status: statusOption?.id || '',
            'board-meeting': boardMeetingOption?.id || '',
            name: councilName?.[0] || '',
            year: year || '',
            'related-board-meeting': [matchingBoardMeeting.id]
        };

        if (agenda && agenda.length > 0) {
            const agendaFile = agenda[0];
            webflowItemData['agenda-2'] = {
                url: agendaFile.url,
                alt: null
            };
        }

        if (minutes && minutes.length > 0) {
            const minutesFile = minutes[0];
            webflowItemData['minutes-2'] = {
                url: minutesFile.url,
                alt: null
            };
        }

        console.log('Updating Webflow item with data:', JSON.stringify(webflowItemData, null, 2));

        // Update Webflow item
        const webflowResponse = await axios.patch(
            `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID2}/items/${webflowId}/live`,
            {
                fieldData: webflowItemData
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.status(200).json({
            success: true,
            message: 'Webflow item updated successfully',
            data: webflowResponse.data
        });
    } catch (error) {
        console.error('Error updating Webflow item from Airtable webhook:', error);
        if (error.response && error.response.data) {
            console.error('Webflow API error details:', JSON.stringify(error.response.data, null, 2));
        }
        res.status(500).json({
            success: false,
            message: 'Error updating Webflow item',
            error: error.message,
            details: error.response?.data
        });
    }
};

module.exports = {
    handleAirtableWebhook,
    handleAirtableUpdateWebhook
}; 
