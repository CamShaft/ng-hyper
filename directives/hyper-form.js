/**
 * Module dependencies
 */

var package = require('../package');
var emitter = require('hyper-emitter');
var utils = require('../lib/utils');
var $watchPath = utils.$watchPath;
var $safeApply = utils.$safeApply;
var merge = utils.merge;
var shallowMerge = utils.shallowMerge;
var loading = utils.loading;
var loaded = utils.loaded;
var each = require('each');
var createLink = require('./hyper-link').create;
var qs = require('querystring');

/**
 * hyperForm
 */

package.directive('hyperForm', [
  '$location',
  function($location) {
    return {
      scope: true,
      require: 'form',
      link: function($scope, elem, attrs, form) {
        loading(elem);

        var handle = getHandleFunction($scope, attrs);

        elem.bind('submit', function() {
          if ($scope.submit) $scope.submit();
        });

        $watchPath.call($scope, attrs.hyperForm, function(err, value) {
          // TODO come up with an error strategy
          if (err) return console.error(err.stack || err);

          if (value && value.action) return setup(value);
          return teardown(value);
        });

        function setup(config) {
          if (!canUpdate()) return;

          unwatch();
          $scope.values = {};
          $scope.inputs = getInputs(config.input, $scope);

          $scope.set = initSet($scope.inputs);
          $scope.submit = initSubmit(config.method, config.action);
          $scope.reset = initReset();

          return loaded(elem);
        }

        function teardown() {
          unwatch();
          delete $scope.values;
          delete $scope.inputs;

          delete $scope.set;
          delete $scope.submit;
          delete $scope.reset;

          return loading(elem);
        }

        function getInputs(inputs, $scope) {
          var ins = {};
          var old = $scope.inputs;
          var i = 0;

          var setValue = initSetValue(inputs);

          each(inputs, function(name, conf) {
            var value = conf.value;

            if (conf.type === 'hidden') return setValue(name, value);

            // We have to clone this object so hyper-path doesn't watch for changes on the model
            var input = shallowMerge({
              $model: value,
              $orig: value, // TODO do we need to clone this so it doesn't change on us?
              name: name
            }, conf);

            // Allow addressing the input from either the index or the name
            ins[i++] = input;
            ins[name] = input;

            input.$unwatch = $scope.$watch(function () {
              return input.$model;
            }, function() {
              setValue(name, input.$model);
            });
          });

          if (i === 0) return [];

          ins.length = i;
          return merge(old, ins);
        }

        function initSetValue (inputs) {
          return function setValue(name, value) {
            $scope.values[name] = value;
            if (inputs[name].$orig !== value) form.$setDirty();
          };
        }

        function canUpdate() {
          // TODO allow dirty updating config via attr
          return !form.$dirty;
        }

        function initSet(inputs) {
          return function set(name, value) {
            if (inputs[name]) inputs[name].$model = value;
          };
        }

        function initSubmit(method, action) {
          method = (method || 'GET').toUpperCase();
          return function submit() {
            // TODO if the method is idempotent and the form is pristine don't submit
            // TODO verify the form is valid
            $scope.hyperFormLoading = true;
            attrs.hyperAction && method === 'GET'
              ? followLink(action, $scope.values, attrs.hyperAction)
              : emitter.submit(method, action, $scope.values, onfinish);
          };
        }

        function initReset() {
          return function reset() {
            // TODO
          };
        }

        function onfinish(err, res) {
          $safeApply.call($scope, function() {
            delete $scope.hyperFormLoading;
            handle(err, res);
            if (err) $scope.hyperFormError = err.error;
            // TODO what are other status that we want to expose?
            $setPristine(form, elem);
          });
        }

        function followLink(action, values, hyperAction) {
          // TODO check if action has a '?'
          var url = action + '?' + qs.stringify(values);
          var $tmp = $scope.$new();
          $tmp.query = {query: {href: url}};
          var res = createLink(hyperAction, $tmp);
          $tmp.$destroy();
          if (!res.loaded) return;
          $safeApply.call($scope, function() {
            $location.path(res.href);
          });
        }
      }
    };
  }
]);

function $setPristine(form, elem) {
  if (form.$setPristine) return form.$setPristine();
  form.$pristine = true;
  form.$dirty = false;
  elem.addClass('ng-pristine');
  elem.removeClass('ng-dirty');
  each(form, function(key, input) {
    if (!input || key.charAt(0) === '$') return;
    if (input.$pristine) input.$pristine = true;
    if (input.$dirty) input.$dirty = false;
  });
}

function getHandleFunction($scope, attrs) {
  return attrs.hyperHandle
    ? $scope.$eval(attrs.hyperHandle)
    : noop;
}

function unwatch(inputs) {
  if (!inputs) return;
    each(inputs, function(input) {
    input.$unwatch();
  });
}

function noop() {}
