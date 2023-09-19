var express = require('express');
var router = express.Router();
const bodyParser = require('body-parser');
const multer = require('multer');
const cookieParser = require('cookie-parser')
const upload = multer();
const app = require("../bot/app.js");
const server = require("../bot/server.json");

var lastTriggerID = "";
var allowWorkflowExecution = true;
var notificationsQueue = []

router.get('/', function (req, res, next) {
    var notificationInfo = req.body
    console.log("A request for things received at " + Date.now());
    res.send('You have arrived at the /api endpoint. Timestamp : ' + new Date().toISOString());
})

router.use('/', function (req, res, next) {
    var notificationInfo = req.body
    console.log("A request for things received at " + Date.now());
    console.log('Request body: ' + JSON.stringify(notificationInfo))
    next();
})

router.post('/', function (req, res, next) {
    var bot = req.app.get('bot')
    var apiResponse = "";
    var matchedNotification = null;
    var notificationInfo = req.body
    var notificationType = notificationInfo[server.env.bot.model.constants.props[server.env.bot.model.constants.labNotificationFilterKey].value]

    if (allowWorkflowExecution) {

        for (let x = server.env.bot.model.notificationTypes.labResults.nmcLabResults; x <= server.env.bot.model.notificationTypes.labResults.afpLabResults; x++) {
            let workflow = server.env.bot.model.notificationTypes.labResults.props[x]

            if (workflow.programStageID == notificationType) {
                matchedNotification = workflow
                break;
            }
        }

        if (matchedNotification != null) {
            app.fetchNotificationTemplate(matchedNotification.template).then(function (res) {
                let queueItem = null
                let notificationTemplate = res.data
                let userGroupID = (matchedNotification.userGroup == "use_default") ? notificationTemplate.recipientUserGroup : matchedNotification.userGroup;

                
                if (notificationsQueue.length > 0) 
                    queueItem = notificationsQueue.find(item => item.id == notificationInfo[server.env.bot.model.constants.props[server.env.bot.model.constants.duplicationPrevention].value])
                
                if (queueItem == null){
                    queueItem = app.addToNotificationsQueue(notificationInfo, notificationTemplate.messageTemplate, notificationsQueue)
                    
                    if (queueItem.currentValues == queueItem.expectedValues)
                        queueItem.ready = true;
                }
                else {
                    queueItem = app.updateQueueItemValues(notificationInfo, notificationTemplate.messageTemplate, queueItem)

                    if (queueItem.updated == true){
                        if (queueItem.currentValues == queueItem.expectedValues)
                            queueItem.ready = true;
                    }
                }
                if (queueItem.ready) {
                    queueItem.ready = false; //reset ready flag for next duplicate trigger
                    queueItem.updated = false;
                    app.fetchUserGroup(userGroupID).then(function (res) {
                        let userGroup = res.data
                        lastTriggerID = notificationInfo[server.env.bot.model.constants.props[server.env.bot.model.constants.duplicationPrevention].value]

                        for (let x = 0; x < userGroup.users.length; x++) {
                            app.fetchUser(userGroup.users[x].id).then(function (res) {
                                let userInfo = res.data
                                if (userInfo.telegram) {
                                    queueItem.notified = true;
                                    bot.pushMessage(userInfo.telegram, queueItem.notification)
                                }
                            })
                        }
                    })
                }
                else{
                    console.log("Notification not approved as required value count not met")
                    console.log("Queue Item :" + JSON.stringify(queueItem))
                }

            })
        }
        apiResponse = '{"status": "OK", "result": "Notification successfully sent"}'

    }
    else
        apiResponse = '{"status": "ERROR", "result": "Notification not send. Duplicate trigger detected"}'

    res.json(JSON.parse(apiResponse));
})


module.exports = router;