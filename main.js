var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];

	constraints(filePath);

	generateTestCases()

}

var engine = Random.engines.mt19937().autoSeed();

function createConcreteIntegerValue( greaterThan, constraintValue )
{
	if( greaterThan )
		return Random.integer(constraintValue+1,constraintValue+10)(engine);
	else
		return Random.integer(constraintValue-10,constraintValue-1)(engine);
}

function createRandomString(n)
{
	var str = Random.string()(engine, n);
	return str
}

function Constraint(properties)
{
	this.ident = properties.ident;
	this.expression = properties.expression;
	this.operator = properties.operator;
	this.value = properties.value;
	this.funcName = properties.funcName;
	// Supported kinds: "fileWithContent","fileExists"
	// integer, string, phoneNumber
	this.kind = properties.kind;
}

function fakeDemo()
{
	console.log( faker.phone.phoneNumber() );
	console.log( faker.phone.phoneNumberFormat() );
	console.log( faker.phone.phoneFormats() );
}

var functionConstraints =
{
}

var mockFileLibrary = 
{
	pathExists:
	{
		'path/fileExists': {file1: ''},
	},
	fileWithContent:
	{
		pathContent: 
		{	
  			file1: 'text content',
		},
	}
};


function generateFileLibrary()
{
	if(Random.bool(0.5)(engine))
	{
		mockFileLibrary['pathExists']['path/fileExists'] = {}
	}
	else
	{
		mockFileLibrary['pathExists']['path/fileExists'] = {file1: ''}	
	}
	if(Random.bool(0.5)(engine))
	{
		mockFileLibrary['fileWithContent']['pathContent'] = {file1: 'text content'}
	}
	else
	{
		mockFileLibrary['fileWithContent']['pathContent'] = {file1: ''}
	}
}

function generateTestCases()
{

	var content = "var subject = require('./subject.js')\nvar mock = require('mock-fs');\n";
	operators = ['==', '>=', '<=', '!=', '>', '<'];
	for ( var funcName in functionConstraints )
	{
		// console.log(funcName)
		var params = {};

		// initialize params
		for (var i =0; i < functionConstraints[funcName].params.length; i++ )
		{
			var paramName = functionConstraints[funcName].params[i];
			
			params[paramName] = ['\'\''];
			
		}
		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;
		// Handle global constraints...
		var fileWithContent = _.some(constraints, {kind: 'fileWithContent' });
		var pathExists      = _.some(constraints, {kind: 'fileExists' });

		// plug-in values for parameters
		for( var c = 0; c < constraints.length; c++ )
		{
			var constraint = constraints[c];
			if( params.hasOwnProperty( constraint.ident ) )
			{
				if( params[paramName][0] == '\'\'')
				{
					
					params[constraint.ident] = [constraint.value];
				}
				else
				{
					params[constraint.ident].push(constraint.value);		
				}

				if(operators.indexOf(constraint.operator) > -1 && constraint.kind == 'integer')
				{
					params[constraint.ident].push(createConcreteIntegerValue(true, constraint.value));
					params[constraint.ident].push(createConcreteIntegerValue(false, constraint.value));
				}
				else if(constraint.kind == 'string')
				{	
					var str = createRandomString(10);
					params[constraint.ident].push( "'" + str + "'");
				}
				else if(constraint.kind == 'bool')
				{
					params[constraint.ident].push(true);
					params[constraint.ident].push(false);
				}
				if(constraint.kind == 'indexOf')
				{	
					var str = createRandomString(5);
					params[constraint.ident].push("'" + str + constraint.value + "'");
					params[constraint.ident].push(constraint.value);	
				}
			}
		}
		
		var keys = Object.keys(params)
		// Little modifications to specific params
		for(var i = 0; i < keys.length; i++)
		{
			if(params[keys[i]].indexOf('\'path/fileExists\'') > -1 && params[keys[i]].indexOf('\'pathContent/file1\'') > -1)
			{
				params[keys[i]] = ['\'pathContent/file1\''];
			}
		}

		if(keys.indexOf('phoneNumber') > -1)
		{
			params['phoneNumber'].push('\'1-212-458-5294\'')
		}
		// console.log(params);
		var params_list = [Object.keys(params).map( function(k) 
			{	
				if(typeof params[k] != 'string')
				{
					return params[k][0];	
				}
				else
				{
					return params[k];
				}
			})]
		for( var i = 0; i < Object.keys(params).length; i++)
		{
			params_list = addMoreTestCase(params_list, params, i);	
		}

		// Prepare function arguments.
		var args = Object.keys(params).map( function(k) 
			{
				if(typeof params[k] != 'string')
				{
					return params[k][0];	
				}
				else
				{
					return params[k];
				}
			}).join(",");
		var args_list = [args];
		for(var i = 0; i < params_list.length; i++)
		{
			args_list.push(params_list[i].join(","));
		}

		args_list = args_list.filter(function(item, pos) {
    						return args_list.indexOf(item) == pos;
						})

		if( pathExists || fileWithContent )
		{
			for(var i = 0; i < args_list.length; i++)
			{
				content += generateMockFsTestCases(pathExists,fileWithContent,funcName, args_list[i]);
				// Bonus...generate constraint variations test cases....
				content += generateMockFsTestCases(!pathExists,fileWithContent,funcName, args_list[i]);
				content += generateMockFsTestCases(pathExists,!fileWithContent,funcName, args_list[i]);
				content += generateMockFsTestCases(!pathExists,!fileWithContent,funcName, args_list[i]);
			}
		}
		else
		{
			// Emit simple test case.
			for(var i = 0; i < args_list.length; i++)
			{
				content += "subject.{0}({1});\n".format(funcName, args_list[i] );	
			}
		}
	}
	fs.writeFileSync('test.js', content, "utf8");
}

function addMoreTestCase(params_list, params, i)
{	
	var key = Object.keys(params)[i];
	var more_params = [];
	for(var c = 0; c < params_list.length; c++)
	{	
		if(typeof params[key] != 'string')
		{
			for(var d = 0; d < params[key].length; d++)
			{
				var tmp = params_list[c].slice();
				tmp[i] = params[key][d];
				more_params.push(tmp);
			}
		}
		
	}
	return params_list.concat(more_params);
}

function generateMockFsTestCases (pathExists,fileWithContent,funcName,args) 
{
	var testCase = "";
	// Build mock file system based on constraints.
	for(var i = 0; i < 20; i++)
	{
		var mergedFS = {};
		generateFileLibrary();
		if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) 
		{ 
			mergedFS[attrname] = mockFileLibrary.pathExists[attrname];
		}
	}
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) 
		{ 
			mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; 
		}
	}
	testCase += 
	"mock(" +
		JSON.stringify(mergedFS)
		+
	");\n";

	testCase += "\tsubject.{0}({1});\n".format(funcName, args );
	testCase+="mock.restore();\n";
	}
	return testCase;
}


function constraints(filePath)
{
   var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);
	traverse(result, function (node) 
	{
		if (node.type === 'FunctionDeclaration') 
		{
			var funcName = functionName(node);
			console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));

			var params = node.params.map(function(p) {return p.name});

			functionConstraints[funcName] = {constraints:[], params: params};
			if( params.indexOf('phoneNumber') > -1 )
			{
				functionConstraints[funcName].constraints.push(
					new Constraint(
					{
						ident: 'phoneNumber',
						value: '\'' + faker.phone.phoneNumber()+'\'',
						funcName: funcName,
						kind: 'phoneNumber',
						operator : undefined,
						expression: undefined
					}));
			}
			// Check for expressions using argument.
			operators = ['==', '>=', '<=', '!=', '>', '<'];

			traverse(node, function(child)
			{	
				if( child.type === 'BinaryExpression' && operators.indexOf(child.operator) > -1)
				{
					
					if( child.left.type == 'CallExpression' && child.left.callee.property.name == 'indexOf')
					{
						var expression = buf.substring(child.range[0], child.range[1]);
						argument = child.left.arguments[0].raw;	
						idx = child.right.value;
						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.callee.object.name,
								value: argument,
								funcName: funcName,
								kind: 'indexOf',
								operator : child.operator,
								expression: expression
							}));
					}
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						// get expression from original source code:
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])

						var a = parseInt(rightHand);
						var kind;
						if (isNaN(a))
						{
							kind = "string";
						}
						else
						{
							kind = "integer";
						}

						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.name,
								value: rightHand,
								funcName: funcName,
								kind: kind,
								operator : child.operator,
								expression: expression
							}));
					}
				}

				var comparators = ['||', '&&'];
				if( child.type === 'LogicalExpression' && comparators.indexOf(child.operator) > -1)
				{	
					if(child.left.type == 'UnaryExpression' && params.indexOf( child.left.argument.name ) > -1)
					{
						// get expression from original source code:
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])
						var kind = 'bool';

						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.argument.name,
								value: false,
								funcName: funcName,
								kind: kind,
								operator : child.operator,
								expression: expression
							}));
					}
				}

				if( child.type == "CallExpression" && 
					 child.callee.property &&
					 child.callee.property.name =="readFileSync" )
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								value:  "'pathContent/file1'",
								funcName: funcName,
								kind: "fileWithContent",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}

				if( child.type == "CallExpression" &&
					 child.callee.property &&
					 child.callee.property.name =="existsSync")
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								// A fake path to a file
								value:  "'path/fileExists'",
								funcName: funcName,
								kind: "fileExists",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}

			});
			console.log( functionConstraints[funcName]);
		}
	});
}

function traverse(object, visitor) 
{
    var key, child;

    visitor.call(null, object);
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, visitor);
            }
        }
    }
}

function traverseWithCancel(object, visitor)
{
    var key, child;

    if( visitor.call(null, object) )
    {
	    for (key in object) {
	        if (object.hasOwnProperty(key)) {
	            child = object[key];
	            if (typeof child === 'object' && child !== null) {
	                traverseWithCancel(child, visitor);
	            }
	        }
	    }
 	 }
}

function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "";
}


if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();