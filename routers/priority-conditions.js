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

router.use('/', function (req, res, next) {
    let notificationInfo = req.body

    console.log("A request for things received at " + Date.now());
    console.log('Request body: ' + JSON.stringify(notificationInfo))

    if (lastTriggerID != notificationInfo[server.env.bot.model.constants.props[server.env.bot.model.constants.duplicationPrevention].value]) {
        lastTriggerID = notificationInfo[server.env.bot.model.constants.props[server.env.bot.model.constants.duplicationPrevention].value];
        allowWorkflowExecution = true;
    }
    else
        allowWorkflowExecution = false;

    next();
})

router.post('/', function (req, res) {
    var bot = req.app.get('bot')
    var notificationInfo = req.body
    var notificationType = notificationInfo[server.env.bot.model.constants.props[server.env.bot.model.constants.conditionType].value]
    var apiResponse = "";
    var matchedNotification = null;

    for (let x = server.env.bot.model.notificationTypes.priorityConditions["priority-conditions-covid19"]; x <= server.env.bot.model.notificationTypes.priorityConditions["priority-conditions-zika"]; x++) {
        let workflow = server.env.bot.model.notificationTypes.priorityConditions.props[x]

        if (workflow.conditionType == notificationType) {
            matchedNotification = workflow
            break;
        }
    }

    if (matchedNotification != null) {
        app.fetchNotificationTemplate(matchedNotification.template).then(function (res) {
            let notificationTemplate = res.data
            let userGroupID = (matchedNotification.userGroup == "use_default") ? notificationTemplate.recipientUserGroup : matchedNotification.userGroup;

            app.fetchUserGroup(userGroupID).then(function (res) {
                let userGroup = res.data

                lastTriggerID = notificationInfo[server.env.bot.model.constants.props[server.env.bot.model.constants.duplicationPrevention].value]

                for (let x = 0; x < userGroup.users.length; x++) {
                    app.fetchUser(userGroup.users[x].id).then(function (res) {
                        let userInfo = res.data
                        if (userInfo.telegram) {
                            try {
                                bot.pushMessage(userInfo.telegram, app.draftNotification(notificationTemplate.messageTemplate, notificationInfo))
                            }
                            catch (err) {
                                console.log('Error sending Telegram message to ' + userInfo.displayName + '. Further investigation required')
                            }
                        }
                    })
                }
            })
        })
        apiResponse = '{"status": "OK", "result": "Notification successfully sent"}'
    }
    else
        apiResponse = '{"status": "ERROR", "result": "Notification not send. Duplicate trigger detected"}'

    res.json(JSON.parse(apiResponse));
})

module.exports = router;
